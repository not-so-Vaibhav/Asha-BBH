import type { Language } from '../domain/types';
import type { SpeechProvider, TranscriptUpdate } from './SpeechProvider';

const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 512;

function audioUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/gnani/stt`;
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
  private stopRequested = false;
  private flushPendingAudio: (() => void) | null = null;
  private resolveCapture: (() => void) | null = null;
  private rejectCapture: ((error: Error) => void) | null = null;

  async capture(_demoTranscript: string, _language: Language, onTranscript: TranscriptUpdate): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is not available in this browser. Use Simulated or type the visit.');
    if (!('AudioContext' in window) && !('webkitAudioContext' in (window as Window & { webkitAudioContext?: typeof AudioContext }))) {
      throw new Error('Live audio processing is not available in this browser. Use Simulated or type the visit.');
    }
    this.stopRequested = false;
    let transcript = '';
    let audioReady = false;
    let pending: number[] = [];

    const captureDone = new Promise<void>((resolve, reject) => {
      this.resolveCapture = resolve;
      this.rejectCapture = reject;
    });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.stopRequested) { this.releaseAudio(); this.resolveCapture?.(); return captureDone; }
      const w = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextCtor = window.AudioContext || w.webkitAudioContext;
      if (!AudioContextCtor) throw new Error('AudioContext is not available.');
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
        if (pending.length && this.socket?.readyState === WebSocket.OPEN) this.socket.send(pcmFrame(pending));
        pending = [];
      };
      this.processor.onaudioprocess = (event) => {
        if (!audioReady || this.socket?.readyState !== WebSocket.OPEN || this.stopRequested) return;
        const samples = resample(event.inputBuffer.getChannelData(0), this.context?.sampleRate ?? SAMPLE_RATE);
        for (let i = 0; i < samples.length; i++) pending.push(samples[i]);
        while (pending.length >= FRAME_SAMPLES) {
          this.socket.send(pcmFrame(pending));
          pending = pending.slice(FRAME_SAMPLES);
        }
      };

      this.socket = new WebSocket(audioUrl());
      this.socket.binaryType = 'arraybuffer';
      this.socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        let message: { type?: string; text?: string; message?: string };
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'connected') { audioReady = true; return; }
        if (message.type === 'transcript' && message.text?.trim()) {
          transcript = [transcript, message.text.trim()].filter(Boolean).join(' ');
          onTranscript(transcript);
        }
        if (message.type === 'error') this.fail(new Error(message.message || 'Gnani Prisma reported a transcription error.'));
      };
      this.socket.onerror = () => this.fail(new Error('Could not connect to Gnani Prisma. Check the local server and API access.'));
      this.socket.onclose = () => {
        this.releaseAudio();
        if (this.stopTimer) clearTimeout(this.stopTimer);
        this.stopTimer = null;
        const resolve = this.resolveCapture;
        const reject = this.rejectCapture;
        this.resolveCapture = null;
        this.rejectCapture = null;
        if (transcript.trim()) resolve?.();
        else if (this.stopRequested) reject?.(new Error('No speech was captured. Type the visit or try again.'));
        else reject?.(new Error('Gnani Prisma ended the session before returning a transcript.'));
      };
      return captureDone;
    } catch (error) {
      this.releaseAudio();
      this.rejectCapture = null;
      this.resolveCapture = null;
      throw error instanceof Error ? error : new Error('Gnani Prisma could not start.');
    }
  }

  stop() {
    if (this.stopRequested) return;
    this.stopRequested = true;
    this.flushPendingAudio?.();
    this.flushPendingAudio = null;
    this.releaseAudio();
    const socket = this.socket;
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      this.resolveCapture?.();
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'commit' }));
      this.stopTimer = setTimeout(() => socket.close(1000, 'User stopped capture'), 1_200);
    } else {
      socket.close();
    }
  }

  private fail(error: Error) {
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
