import type { Language } from '../domain/types';
import { getActiveAccessToken } from '../lib/supabase';
import type { SpeechProvider, TranscriptUpdate } from './SpeechProvider';
import { updateVoiceTelemetry, type SttConnectionState } from './telemetry';

const SAMPLE_RATE = 16_000;
/** Official Gnani Prisma v3.0 frame size: 1,024 bytes = 512 Int16 samples = 32 ms at 16 kHz. */
const FRAME_SAMPLES = 512;
const CONNECT_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = [500, 1_000, 2_000];

const NON_RETRYABLE_CODES = new Set([
  'NOT_CONFIGURED',
  'UPSTREAM_AUTH',
  'RATE_LIMITED',
  'CONCURRENCY_LIMIT',
  'AUDIO_LIMIT',
  'INVALID_CONTROL',
]);

export type GnaniErrorCode = 'mic-denied' | 'mic-unavailable' | 'offline' | 'gnani-error' | 'no-speech';

export class GnaniCaptureError extends Error {
  readonly code: GnaniErrorCode;
  readonly detailCode?: string;
  constructor(code: GnaniErrorCode, message: string, detailCode?: string) {
    super(message);
    this.name = 'GnaniCaptureError';
    this.code = code;
    this.detailCode = detailCode;
  }
}

export type GnaniProviderOptions = {
  onStateChange?: (state: SttConnectionState) => void;
  reconnectBackoffMs?: number[];
  maxReconnectAttempts?: number;
  heartbeatIntervalMs?: number;
  connectTimeoutMs?: number;
};

function audioUrl(language: Language, accessToken: string | null) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ language });
  if (accessToken) params.set('access_token', accessToken);
  return `${protocol}//${window.location.host}/api/gnani/stt?${params.toString()}`;
}

function pcmFrame(samples: number[]) {
  const pcm = new Int16Array(FRAME_SAMPLES);
  for (let i = 0; i < Math.min(samples.length, FRAME_SAMPLES); i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function resample(input: Float32Array, fromRate: number) {
  if (fromRate === SAMPLE_RATE) return input;
  const ratio = fromRate / SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const amount = position - left;
    output[i] = input[left] * (1 - amount) + input[right] * amount;
  }
  return output;
}

export class GnaniProvider implements SpeechProvider {
  readonly name = 'Gnani Prisma v3.0';
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopRequested = false;
  private flushPendingAudio: (() => void) | null = null;
  private resolveCapture: (() => void) | null = null;
  private rejectCapture: ((error: Error) => void) | null = null;
  private options: GnaniProviderOptions;

  constructor(options: GnaniProviderOptions = {}) {
    this.options = options;
  }

  private setState(state: SttConnectionState, extra: Record<string, unknown> = {}) {
    updateVoiceTelemetry({ activeProvider: this.name, sttState: state, ...extra });
    this.options.onStateChange?.(state);
  }

  async capture(_demoTranscript: string, language: Language, onTranscript: TranscriptUpdate): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setState('fallback', { lastErrorCode: 'OFFLINE' });
      throw new GnaniCaptureError('offline', 'No network connection.', 'OFFLINE');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setState('fallback', { lastErrorCode: 'MIC_UNAVAILABLE' });
      throw new GnaniCaptureError('mic-unavailable', 'Microphone capture is not available in this browser.', 'MIC_UNAVAILABLE');
    }
    if (!('AudioContext' in window) && !('webkitAudioContext' in (window as Window & { webkitAudioContext?: typeof AudioContext }))) {
      this.setState('fallback', { lastErrorCode: 'AUDIOCONTEXT_UNAVAILABLE' });
      throw new GnaniCaptureError('mic-unavailable', 'Live audio processing is not available in this browser.', 'AUDIOCONTEXT_UNAVAILABLE');
    }

    this.stopRequested = false;
    let committedTranscript = '';
    let interimTranscript = '';
    let audioReady = false;
    let pending: number[] = [];
    let reconnectAttempts = 0;
    let fatalErrorCode: string | null = null;
    let firstFrameSentAt: number | null = null;
    let firstPartialRecorded = false;
    const captureStartedAt = performance.now();

    const maxReconnects = this.options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;
    const backoffs = this.options.reconnectBackoffMs ?? RECONNECT_BACKOFF_MS;
    const connectTimeoutMs = this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    const heartbeatIntervalMs = this.options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;

    updateVoiceTelemetry({
      activeProvider: this.name,
      sttState: 'connecting',
      timeToFirstPartialMs: null,
      timeToFinalMs: null,
      reconnectCount: 0,
      lastErrorCode: null,
    });
    this.options.onStateChange?.('connecting');

    const captureDone = new Promise<void>((resolve, reject) => {
      this.resolveCapture = resolve;
      this.rejectCapture = reject;
    });

    const combinedTranscript = () => [committedTranscript, interimTranscript].filter(Boolean).join(' ').trim();

    const openSocket = async (isReconnect: boolean) => {
      this.clearSocketTimers();
      audioReady = false;
      if (isReconnect) {
        this.setState('reconnecting', { reconnectCount: reconnectAttempts });
      } else {
        this.setState('connecting');
      }

      const token = await getActiveAccessToken().catch(() => null);
      if (this.stopRequested) return;
      const ws = new WebSocket(audioUrl(language, token));
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      this.connectTimer = setTimeout(() => {
        if (!audioReady && this.socket === ws) {
          ws.close(1006, 'Connect timeout');
        }
      }, connectTimeoutMs);

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        let message: { type?: string; text?: string; message?: string; code?: string; is_final?: boolean };
        try { message = JSON.parse(event.data); } catch { return; }

        if (message.type === 'connected') {
          audioReady = true;
          if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
          this.setState('listening');
          this.heartbeatTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
            }
          }, heartbeatIntervalMs);
          return;
        }

        if (message.type === 'pong' || message.type === 'speech_start' || message.type === 'processing') {
          return;
        }

        if ((message.type === 'partial' || (message.type === 'transcript' && message.is_final === false)) && message.text?.trim()) {
          if (!firstPartialRecorded) {
            firstPartialRecorded = true;
            const origin = firstFrameSentAt ?? captureStartedAt;
            updateVoiceTelemetry({ timeToFirstPartialMs: Math.round(performance.now() - origin) });
          }
          interimTranscript = message.text.trim();
          onTranscript(combinedTranscript(), false);
          return;
        }

        if (message.type === 'transcript' && message.text?.trim()) {
          const now = performance.now();
          const origin = firstFrameSentAt ?? captureStartedAt;
          if (!firstPartialRecorded) {
            firstPartialRecorded = true;
            updateVoiceTelemetry({ timeToFirstPartialMs: Math.round(now - origin) });
          }
          updateVoiceTelemetry({ timeToFinalMs: Math.round(now - origin) });
          interimTranscript = '';
          committedTranscript = [committedTranscript, message.text.trim()].filter(Boolean).join(' ');
          onTranscript(committedTranscript, true);
          return;
        }

        if (message.type === 'error') {
          const errCode = message.code || 'GNANI_ERROR';
          fatalErrorCode = errCode;
          updateVoiceTelemetry({ lastErrorCode: errCode });
          if (NON_RETRYABLE_CODES.has(errCode) || !audioReady) {
            this.fail(new GnaniCaptureError('gnani-error', message.message || 'Gnani Prisma reported a transcription error.', errCode));
          } else {
            ws.close(1011, errCode);
          }
        }
      };

      ws.onerror = () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          fatalErrorCode = 'OFFLINE';
          this.fail(new GnaniCaptureError('offline', 'No network connection.', 'OFFLINE'));
        }
      };

      ws.onclose = (closeEvent) => {
        if (this.socket !== ws) return;
        this.clearSocketTimers();
        audioReady = false;
        this.socket = null;

        // If user explicitly stopped capture, finalize cleanly.
        if (this.stopRequested) {
          this.releaseAudio();
          this.setState('idle');
          const resolve = this.resolveCapture;
          const reject = this.rejectCapture;
          this.resolveCapture = null;
          this.rejectCapture = null;
          if (combinedTranscript()) resolve?.();
          else reject?.(new GnaniCaptureError('no-speech', 'No speech was captured.', 'NO_SPEECH'));
          return;
        }

        // Unexpected close (e.g., Vercel Fluid Compute maxDuration or transient drop) -> reconnect with backoff.
        const canRetry =
          !fatalErrorCode &&
          reconnectAttempts < maxReconnects &&
          (typeof navigator === 'undefined' || navigator.onLine !== false);

        if (canRetry) {
          const delay = backoffs[Math.min(reconnectAttempts, backoffs.length - 1)] ?? 1_000;
          reconnectAttempts += 1;
          this.setState('reconnecting', {
            reconnectCount: reconnectAttempts,
            lastErrorCode: `WS_CLOSE_${closeEvent.code || 1006}`,
          });
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.stopRequested) openSocket(true);
          }, delay);
          return;
        }

        // Exhausted retries or fatal error: preserve transcript if we already got speech, otherwise fail into fallback.
        this.releaseAudio();
        const resolve = this.resolveCapture;
        const reject = this.rejectCapture;
        this.resolveCapture = null;
        this.rejectCapture = null;
        if (combinedTranscript()) {
          this.setState('idle');
          resolve?.();
        } else {
          const errCode = fatalErrorCode || `WS_CLOSE_${closeEvent.code || 1006}`;
          this.setState('error', { lastErrorCode: errCode });
          reject?.(new GnaniCaptureError('gnani-error', 'Gnani Prisma ended the session before returning a transcript.', errCode));
        }
      };
    };

    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          this.setState('fallback', { lastErrorCode: 'MIC_DENIED' });
          throw new GnaniCaptureError('mic-denied', 'Microphone permission was denied.', 'MIC_DENIED');
        }
        this.setState('fallback', { lastErrorCode: 'MIC_UNAVAILABLE' });
        throw new GnaniCaptureError('mic-unavailable', 'Microphone could not be accessed.', 'MIC_UNAVAILABLE');
      }

      if (this.stopRequested) {
        this.releaseAudio();
        this.setState('idle');
        this.resolveCapture?.();
        return captureDone;
      }

      const w = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextCtor = window.AudioContext || w.webkitAudioContext;
      if (!AudioContextCtor) throw new GnaniCaptureError('mic-unavailable', 'AudioContext is not available.', 'AUDIOCONTEXT_UNAVAILABLE');
      try { this.context = new AudioContextCtor({ sampleRate: SAMPLE_RATE }); } catch { this.context = new AudioContextCtor(); }
      await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = this.context.createScriptProcessor(FRAME_SAMPLES, 1, 1);
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.processor);
      this.processor.connect(this.sink);
      this.sink.connect(this.context.destination);

      this.flushPendingAudio = () => {
        if (pending.length && this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(pcmFrame(pending));
        }
        pending = [];
      };

      this.processor.onaudioprocess = (event) => {
        if (!audioReady || this.socket?.readyState !== WebSocket.OPEN || this.stopRequested) return;
        const samples = resample(event.inputBuffer.getChannelData(0), this.context?.sampleRate ?? SAMPLE_RATE);
        for (let i = 0; i < samples.length; i++) pending.push(samples[i]);
        while (pending.length >= FRAME_SAMPLES) {
          if (firstFrameSentAt === null) firstFrameSentAt = performance.now();
          this.socket.send(pcmFrame(pending));
          pending = pending.slice(FRAME_SAMPLES);
        }
      };

      openSocket(false);
      return captureDone;
    } catch (error) {
      this.releaseAudio();
      this.clearAllTimers();
      this.rejectCapture = null;
      this.resolveCapture = null;
      if (error instanceof GnaniCaptureError) throw error;
      this.setState('error', { lastErrorCode: 'START_FAILED' });
      throw new GnaniCaptureError('gnani-error', error instanceof Error ? error.message : 'Gnani Prisma could not start.', 'START_FAILED');
    }
  }

  stop() {
    if (this.stopRequested) return;
    this.stopRequested = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.flushPendingAudio?.();
    this.flushPendingAudio = null;
    this.releaseAudio();
    const socket = this.socket;
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      this.setState('idle');
      this.resolveCapture?.();
      this.resolveCapture = null;
      this.rejectCapture = null;
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'commit' }));
      this.stopTimer = setTimeout(() => socket.close(1000, 'User stopped capture'), 1_200);
    } else {
      socket.close();
    }
  }

  private clearSocketTimers() {
    if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private clearAllTimers() {
    this.clearSocketTimers();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private fail(error: GnaniCaptureError) {
    this.clearAllTimers();
    this.setState('error', { lastErrorCode: error.detailCode || error.code });
    if (this.rejectCapture) {
      this.rejectCapture(error);
      this.rejectCapture = null;
      this.resolveCapture = null;
    }
    this.stopRequested = true;
    this.releaseAudio();
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }

  private releaseAudio() {
    this.flushPendingAudio = null;
    if (this.processor) { this.processor.onaudioprocess = null; try { this.processor.disconnect(); } catch {} }
    try { this.source?.disconnect(); } catch {}
    try { this.sink?.disconnect(); } catch {}
    this.stream?.getTracks().forEach((track) => track.stop());
    const context = this.context;
    this.processor = null;
    this.source = null;
    this.sink = null;
    this.stream = null;
    this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
}
