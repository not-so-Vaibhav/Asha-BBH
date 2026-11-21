import type { Language } from '../domain/types';
import { getActiveAccessToken } from '../lib/supabase';
import { findPregeneratedReadbackUrl, getPregeneratedReadbackEntries } from './readback';
import { updateVoiceTelemetry } from './telemetry';

const voiceLocales: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
const CACHE_NAME = 'asha-sakhi-tts-v2';
const MAX_PHRASE_CACHE = 40;

export type SpeakProvider = 'gnani-timbre' | 'browser-fallback' | 'text-only' | 'stopped';
export type SpeakFallbackReason = 'rate-limited' | 'unavailable' | 'autoplay-blocked';
export type SpeakCacheSource = 'static-pregen' | 'memory' | 'server-cache' | 'live';

export type SpeakResult = {
  provider: SpeakProvider;
  autoplayBlocked?: boolean;
  fallbackReason?: SpeakFallbackReason;
  retriesAttempted?: number;
  latencyMs?: number;
  cached?: boolean;
  cacheSource?: SpeakCacheSource;
};

class TtsProxyError extends Error {
  status: number;
  code: string;
  retriesAttempted: number;
  constructor(status: number, code: string, retriesAttempted = 0) {
    super(`Timbre proxy error (${status}: ${code})`);
    this.status = status;
    this.code = code;
    this.retriesAttempted = retriesAttempted;
  }
}

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let currentRequest: AbortController | null = null;

const phraseCache = new Map<string, Blob>();
const alertAudioCache = new Map<Language, Blob>();

function isAutoplayError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'NotAllowedError' || /not allowed|autoplay|user gesture|interact/i.test(error.message);
}

function setPhraseCache(key: string, blob: Blob) {
  if (phraseCache.has(key)) phraseCache.delete(key);
  phraseCache.set(key, blob);
  if (phraseCache.size > MAX_PHRASE_CACHE) {
    const oldest = phraseCache.keys().next().value;
    if (oldest !== undefined) phraseCache.delete(oldest);
  }
}

async function readCacheStorage(cacheKey: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(cacheKey);
    if (!match) return null;
    const blob = await match.blob();
    return blob && blob.size > 44 ? blob : null;
  } catch {
    return null;
  }
}

async function writeCacheStorage(cacheKey: string, blob: Blob): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/wav' } }));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

async function fetchStaticAudio(url: string, signal?: AbortSignal): Promise<Blob | null> {
  const fromStorage = await readCacheStorage(url);
  if (fromStorage) return fromStorage;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('audio') && !ct.includes('octet-stream')) return null;
    const blob = await response.blob();
    if (!blob || blob.size <= 44) return null;
    void writeCacheStorage(url, blob);
    return blob;
  } catch {
    return null;
  }
}

async function parseProxyFailure(response: Response): Promise<TtsProxyError> {
  let code = response.headers.get('x-speech-error-code') || (response.status === 429 ? 'UPSTREAM_429_EXHAUSTED' : `HTTP_${response.status}`);
  let retriesAttempted = Number(response.headers.get('x-speech-retries') || 0);
  try {
    const json = await response.json();
    if (json && typeof json.code === 'string') code = json.code;
    if (json && typeof json.retriesAttempted === 'number') retriesAttempted = json.retriesAttempted;
  } catch {
    // Non-JSON error body
  }
  return new TtsProxyError(response.status, code, Number.isFinite(retriesAttempted) ? retriesAttempted : 0);
}

async function playBlob(blob: Blob, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  currentObjectUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentObjectUrl);
  await new Promise<void>((resolve, reject) => {
    if (!currentAudio) return reject(new Error('Audio element unavailable'));
    currentAudio.onended = () => resolve();
    currentAudio.onerror = () => reject(new Error('Timbre audio could not be played'));
    void currentAudio.play().catch(reject);
  });
}

function browserSpeak(
  text: string,
  language: string,
  fallbackReason: SpeakFallbackReason,
  retriesAttempted: number,
  onStatus?: (res: SpeakResult) => void,
): Promise<SpeakResult> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    const res: SpeakResult = { provider: 'text-only', fallbackReason, retriesAttempted, cached: false };
    onStatus?.(res);
    return Promise.resolve(res);
  }
  try {
    window.speechSynthesis.cancel();
  } catch {
    const res: SpeakResult = { provider: 'text-only', fallbackReason, retriesAttempted, cached: false };
    onStatus?.(res);
    return Promise.resolve(res);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SpeakResult) => {
      if (settled) return;
      settled = true;
      onStatus?.(result);
      resolve(result);
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLocales[language] ?? voiceLocales.en;
    utterance.rate = 0.94;
    utterance.onend = () => finish({ provider: 'browser-fallback', fallbackReason, retriesAttempted, cached: false });
    utterance.onerror = (event) => {
      const errName = (event as SpeechSynthesisErrorEvent | undefined)?.error;
      if (errName === 'not-allowed') {
        finish({ provider: 'text-only', autoplayBlocked: true, fallbackReason: 'autoplay-blocked', retriesAttempted, cached: false });
      } else {
        finish({ provider: 'text-only', fallbackReason, retriesAttempted, cached: false });
      }
    };
    try {
      // Immediately surface the labelled fallback before browser speech finishes speaking
      onStatus?.({ provider: 'browser-fallback', fallbackReason, retriesAttempted, cached: false });
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      const blocked = isAutoplayError(error);
      finish({
        provider: 'text-only',
        autoplayBlocked: blocked,
        fallbackReason: blocked ? 'autoplay-blocked' : fallbackReason,
        retriesAttempted,
        cached: false,
      });
    }
  });
}

/**
 * Preloads pre-generated Timbre alert WAV files (/audio/alert-{en,hi,mr}.wav) into memory + CacheStorage
 * so emergency alerts play instantly even if the network drops mid-visit.
 */
export async function warmAlertAudioCache(languages: Language[] = ['en', 'hi', 'mr']): Promise<void> {
  await Promise.all(
    languages.map(async (lang) => {
      if (alertAudioCache.has(lang)) return;
      const blob = await fetchStaticAudio(`/audio/alert-${lang}.wav`);
      if (blob) alertAudioCache.set(lang, blob);
    }),
  );
}

/**
 * Preloads priority pre-generated Timbre read-back templates for the active language
 * into memory + CacheStorage so common demo & field read-backs play with 0 Timbre API calls.
 */
export async function warmReadbackAudioCache(language: Language): Promise<void> {
  const priorityEntries = getPregeneratedReadbackEntries(language).filter((entry) => entry.priority);
  await Promise.all(
    priorityEntries.map(async (entry) => {
      const cacheKey = `${language}:readback:${entry.text.trim()}`;
      if (phraseCache.has(cacheKey)) return;
      const blob = await fetchStaticAudio(entry.url);
      if (blob) setPhraseCache(cacheKey, blob);
    }),
  );
}

/**
 * Plays the localized danger-sign alert from pre-cached Timbre audio (0 network calls to Gnani)
 * with graceful fallback to /api/gnani/tts -> Browser speech (Fallback) -> text-only.
 */
export async function speakAlert(
  text: string,
  language: Language = 'en',
  options: { onStatus?: (res: SpeakResult) => void } = {},
): Promise<SpeakResult> {
  stopSpeaking();
  const startedAt = performance.now();
  const controller = new AbortController();
  currentRequest = controller;

  const staticUrl = `/audio/alert-${language}.wav`;
  try {
    let blob: Blob | null = alertAudioCache.get(language) ?? null;
    let cached = Boolean(blob);
    let cacheSource: SpeakCacheSource = 'memory';

    if (!blob) {
      const staticBlob = await fetchStaticAudio(staticUrl, controller.signal);
      if (staticBlob) {
        blob = staticBlob;
        cached = true;
        cacheSource = 'static-pregen';
        alertAudioCache.set(language, blob);
      }
    }

    if (!blob) {
      const token = await getActiveAccessToken().catch(() => null);
      const response = await fetch('/api/gnani/tts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, language, purpose: 'alert' }),
        signal: controller.signal,
      });
      if (!response.ok) throw await parseProxyFailure(response);
      const liveBlob = await response.blob();
      if (!liveBlob || liveBlob.size === 0) throw new TtsProxyError(502, 'EMPTY_AUDIO');
      blob = liveBlob;
      cached = response.headers.get('x-speech-cache') === 'hit';
      cacheSource = cached ? 'server-cache' : 'live';
      alertAudioCache.set(language, blob);
      void writeCacheStorage(staticUrl, blob);
    }

    const fetchLatencyMs = Math.round(performance.now() - startedAt);
    updateVoiceTelemetry({ timbreLatencyMs: fetchLatencyMs, timbreCached: cached });

    if (controller.signal.aborted) return { provider: 'stopped' };
    const result: SpeakResult = { provider: 'gnani-timbre', latencyMs: fetchLatencyMs, cached, cacheSource };
    options.onStatus?.(result);
    await playBlob(blob, controller.signal);
    return result;
  } catch (error) {
    if (controller.signal.aborted) return { provider: 'stopped' };
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; currentAudio = null; }
    if (isAutoplayError(error)) {
      const blocked: SpeakResult = {
        provider: 'text-only',
        autoplayBlocked: true,
        fallbackReason: 'autoplay-blocked',
        latencyMs: Math.round(performance.now() - startedAt),
        cached: alertAudioCache.has(language),
      };
      options.onStatus?.(blocked);
      return blocked;
    }
    const isRateLimited = error instanceof TtsProxyError && (error.status === 429 || error.code.includes('429') || error.code === 'QUEUE_FULL');
    const retriesAttempted = error instanceof TtsProxyError ? error.retriesAttempted : 0;
    const fallbackReason: SpeakFallbackReason = isRateLimited ? 'rate-limited' : 'unavailable';
    updateVoiceTelemetry({ lastErrorCode: error instanceof TtsProxyError ? error.code : 'TTS_ALERT_FALLBACK' });
    return browserSpeak(text, language, fallbackReason, retriesAttempted, options.onStatus);
  } finally {
    if (currentRequest === controller) currentRequest = null;
  }
}

/**
 * Plays read-back using:
 * 1. In-memory phrase cache (0 ms, 0 API calls)
 * 2. Pre-generated static Timbre templates in /audio/readback/ + CacheStorage (0 API calls)
 * 3. Server-side queued Gnani Timbre proxy (/api/gnani/tts, concurrency 1 + 429 backoff retry)
 * 4. Explicit labelled fallback (Browser speech or text-only) when retry fails
 */
export async function speakText(
  text: string,
  language: Language = 'en',
  options: { bypassCache?: boolean; purpose?: 'readback' | 'alert'; onStatus?: (res: SpeakResult) => void } = {},
): Promise<SpeakResult> {
  stopSpeaking();
  const startedAt = performance.now();
  const controller = new AbortController();
  currentRequest = controller;
  const purpose = options.purpose ?? 'readback';
  const cacheKey = `${language}:${purpose}:${text.trim()}`;

  try {
    let blob: Blob | undefined = options.bypassCache ? undefined : phraseCache.get(cacheKey);
    let cached = Boolean(blob);
    let cacheSource: SpeakCacheSource = 'memory';

    if (!blob && !options.bypassCache && purpose === 'readback') {
      const pregenUrl = findPregeneratedReadbackUrl(text, language);
      if (pregenUrl) {
        const pregenBlob = await fetchStaticAudio(pregenUrl, controller.signal);
        if (controller.signal.aborted) return { provider: 'stopped' };
        if (pregenBlob) {
          blob = pregenBlob;
          cached = true;
          cacheSource = 'static-pregen';
          setPhraseCache(cacheKey, blob);
        }
      }
    }

    if (!blob) {
      const token = await getActiveAccessToken().catch(() => null);
      const response = await fetch('/api/gnani/tts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, language, purpose }),
        signal: controller.signal,
      });
      if (!response.ok) throw await parseProxyFailure(response);
      const liveBlob = await response.blob();
      if (controller.signal.aborted) return { provider: 'stopped' };
      if (!liveBlob || liveBlob.size === 0) throw new TtsProxyError(502, 'EMPTY_AUDIO');
      blob = liveBlob;
      cached = response.headers.get('x-speech-cache') === 'hit';
      cacheSource = cached ? 'server-cache' : 'live';
      setPhraseCache(cacheKey, blob);
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    updateVoiceTelemetry({ timbreLatencyMs: latencyMs, timbreCached: cached });

    if (controller.signal.aborted) return { provider: 'stopped' };
    const result: SpeakResult = { provider: 'gnani-timbre', latencyMs, cached, cacheSource };
    options.onStatus?.(result);
    await playBlob(blob, controller.signal);
    return result;
  } catch (error) {
    if (controller.signal.aborted) return { provider: 'stopped' };
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; currentAudio = null; }
    if (isAutoplayError(error)) {
      const blocked: SpeakResult = {
        provider: 'text-only',
        autoplayBlocked: true,
        fallbackReason: 'autoplay-blocked',
        latencyMs: Math.round(performance.now() - startedAt),
        cached: phraseCache.has(cacheKey),
      };
      options.onStatus?.(blocked);
      return blocked;
    }
    const isRateLimited = error instanceof TtsProxyError && (error.status === 429 || error.code.includes('429') || error.code === 'QUEUE_FULL');
    const retriesAttempted = error instanceof TtsProxyError ? error.retriesAttempted : 0;
    const fallbackReason: SpeakFallbackReason = isRateLimited ? 'rate-limited' : 'unavailable';
    updateVoiceTelemetry({ lastErrorCode: error instanceof TtsProxyError ? error.code : 'TTS_FALLBACK' });
    return browserSpeak(text, language, fallbackReason, retriesAttempted, options.onStatus);
  } finally {
    if (currentRequest === controller) currentRequest = null;
  }
}

export function clearTtsCaches() {
  phraseCache.clear();
  alertAudioCache.clear();
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  currentRequest?.abort();
  currentRequest = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}
