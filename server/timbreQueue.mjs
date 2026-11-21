import { createHash } from 'node:crypto';
import { MAX_TTS_AUDIO_BYTES, logApiEvent } from './security.mjs';

export const TIMBRE_TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference';
export const DEFAULT_TIMBRE_MAX_RETRIES = 2;
export const DEFAULT_TIMBRE_BACKOFF_BASE_MS = 750;
export const DEFAULT_TIMBRE_BACKOFF_MAX_MS = 4_000;
export const DEFAULT_TIMBRE_MAX_QUEUE = 12;
export const DEFAULT_TIMBRE_CACHE_ENTRIES = 48;

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfterMs(headerValue, maxMs) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(maxMs, Math.max(250, Math.round(seconds * 1000)));
  }
  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0) return Math.min(maxMs, Math.max(250, delta));
  }
  return null;
}

function makeCacheKey({ model, voice, locale, speed, text, sampleRate }) {
  return createHash('sha256')
    .update(`${model}|${voice}|${locale}|${speed}|${sampleRate}|${text}`)
    .digest('hex');
}

/**
 * Serializes upstream Gnani Timbre TTS requests with strict concurrency 1,
 * retries upstream HTTP 429 with exponential backoff + jitter while holding the slot,
 * and serves repeated phrases from a bounded in-memory LRU cache.
 */
export function createTimbreQueue({
  fetchImpl = fetch,
  ttsUrl = TIMBRE_TTS_URL,
  maxRetries = DEFAULT_TIMBRE_MAX_RETRIES,
  backoffBaseMs = DEFAULT_TIMBRE_BACKOFF_BASE_MS,
  backoffMaxMs = DEFAULT_TIMBRE_BACKOFF_MAX_MS,
  maxQueueSize = DEFAULT_TIMBRE_MAX_QUEUE,
  maxCacheEntries = DEFAULT_TIMBRE_CACHE_ENTRIES,
  requestTimeoutMs = 30_000,
  sleepImpl = defaultSleep,
  randomImpl = Math.random,
} = {}) {
  const queue = [];
  const cache = new Map();
  let running = false;

  function readCache(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  function writeCache(key, value) {
    if (maxCacheEntries <= 0) return;
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    if (cache.size > maxCacheEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  async function executeTask(task) {
    const {
      apiKey,
      text,
      language,
      locale,
      model,
      voice,
      speed,
      sampleRate = 48_000,
      signal,
      enqueuedAt,
    } = task;
    const startedAt = performance.now();
    const queueWaitMs = Math.max(0, Math.round(startedAt - enqueuedAt));

    if (signal?.aborted) {
      return {
        ok: false,
        status: 499,
        errorCode: 'CLIENT_ABORTED',
        message: 'Speech request cancelled.',
        queueWaitMs,
        latencyMs: 0,
        attempts: 0,
        retriesAttempted: 0,
        cacheHit: false,
      };
    }

    const cacheKey = makeCacheKey({ model, voice, locale, speed, text, sampleRate });
    const cached = readCache(cacheKey);
    if (cached) {
      return {
        ok: true,
        status: 200,
        audio: cached.audio,
        contentType: cached.contentType,
        queueWaitMs,
        latencyMs: Math.round(performance.now() - startedAt),
        attempts: 0,
        retriesAttempted: 0,
        cacheHit: true,
      };
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (signal?.aborted) {
        return {
          ok: false,
          status: 499,
          errorCode: 'CLIENT_ABORTED',
          message: 'Speech request cancelled.',
          queueWaitMs,
          latencyMs: Math.round(performance.now() - startedAt),
          attempts: attempt,
          retriesAttempted: Math.max(0, attempt - 1),
          cacheHit: false,
        };
      }

      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      try {
        const upstream = await fetchImpl(ttsUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-API-Key-ID': apiKey },
          body: JSON.stringify({
            text,
            model,
            voice,
            language: locale,
            speed,
            audio_config: {
              sample_rate: sampleRate,
              num_channels: 1,
              sample_width: 2,
              encoding: 'linear_pcm',
              container: 'wav',
            },
          }),
          signal: combinedSignal,
        });

        const latencyMs = Math.round(performance.now() - startedAt);

        if (upstream.ok) {
          const audio = Buffer.from(await upstream.arrayBuffer());
          if (audio.length > MAX_TTS_AUDIO_BYTES) {
            return {
              ok: false,
              status: 502,
              errorCode: 'AUDIO_TOO_LARGE',
              message: 'Speech audio response exceeded size limit.',
              queueWaitMs,
              latencyMs,
              attempts: attempt + 1,
              retriesAttempted: attempt,
              cacheHit: false,
            };
          }
          const contentType = upstream.headers.get('content-type') || 'audio/wav';
          writeCache(cacheKey, { audio, contentType });
          return {
            ok: true,
            status: 200,
            audio,
            contentType,
            queueWaitMs,
            latencyMs,
            attempts: attempt + 1,
            retriesAttempted: attempt,
            cacheHit: false,
          };
        }

        const status = upstream.status;
        const retryAfterHeader = upstream.headers?.get?.('retry-after') || null;
        await upstream.body?.cancel?.();

        if (status === 429) {
          if (attempt < maxRetries) {
            const headerDelay = parseRetryAfterMs(retryAfterHeader, backoffMaxMs);
            const expDelay = Math.min(
              backoffMaxMs,
              Math.round(backoffBaseMs * Math.pow(2, attempt) + randomImpl() * Math.min(150, backoffBaseMs * 0.25)),
            );
            const delayMs = headerDelay ?? expDelay;
            logApiEvent({
              event: 'tts_upstream_retry',
              route: '/api/gnani/tts',
              status: 429,
              errorCode: 'UPSTREAM_429',
              latencyMs,
              language,
            });
            try {
              await sleepImpl(delayMs, signal);
            } catch {
              return {
                ok: false,
                status: 499,
                errorCode: 'CLIENT_ABORTED',
                message: 'Speech request cancelled during retry wait.',
                queueWaitMs,
                latencyMs: Math.round(performance.now() - startedAt),
                attempts: attempt + 1,
                retriesAttempted: attempt,
                cacheHit: false,
              };
            }
            continue;
          }

          return {
            ok: false,
            status: 429,
            errorCode: 'UPSTREAM_429_EXHAUSTED',
            message: 'Speech service is temporarily busy after retry. Fallback active.',
            retryAfterSec: Math.max(2, Math.ceil((parseRetryAfterMs(retryAfterHeader, 10_000) ?? 3_000) / 1000)),
            queueWaitMs,
            latencyMs,
            attempts: attempt + 1,
            retriesAttempted: attempt,
            cacheHit: false,
          };
        }

        if (status === 401 || status === 403) {
          return {
            ok: false,
            status: 502,
            errorCode: 'UPSTREAM_AUTH',
            message: 'Speech service authentication failed.',
            queueWaitMs,
            latencyMs,
            attempts: attempt + 1,
            retriesAttempted: attempt,
            cacheHit: false,
          };
        }

        return {
          ok: false,
          status: 502,
          errorCode: `UPSTREAM_${status}`,
          message: 'Speech synthesis request failed.',
          queueWaitMs,
          latencyMs,
          attempts: attempt + 1,
          retriesAttempted: attempt,
          cacheHit: false,
        };
      } catch {
        const latencyMs = Math.round(performance.now() - startedAt);
        if (signal?.aborted) {
          return {
            ok: false,
            status: 499,
            errorCode: 'CLIENT_ABORTED',
            message: 'Speech request cancelled.',
            queueWaitMs,
            latencyMs,
            attempts: attempt + 1,
            retriesAttempted: attempt,
            cacheHit: false,
          };
        }
        return {
          ok: false,
          status: 502,
          errorCode: 'UPSTREAM_NETWORK',
          message: 'Speech service is temporarily unavailable.',
          queueWaitMs,
          latencyMs,
          attempts: attempt + 1,
          retriesAttempted: attempt,
          cacheHit: false,
        };
      }
    }

    return {
      ok: false,
      status: 429,
      errorCode: 'UPSTREAM_429_EXHAUSTED',
      message: 'Speech service is temporarily busy after retry. Fallback active.',
      retryAfterSec: 3,
      queueWaitMs,
      latencyMs: Math.round(performance.now() - startedAt),
      attempts: maxRetries + 1,
      retriesAttempted: maxRetries,
      cacheHit: false,
    };
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry || entry.cancelled) continue;
        entry.cleanupAbort?.();
        const result = await executeTask(entry.task);
        entry.resolve(result);
      }
    } finally {
      running = false;
      if (queue.length > 0) void drain();
    }
  }

  function synthesize(task) {
    const sampleRate = task.sampleRate ?? 48_000;
    const cacheKey = makeCacheKey({
      model: task.model,
      voice: task.voice,
      locale: task.locale,
      speed: task.speed,
      text: task.text,
      sampleRate,
    });
    const cached = readCache(cacheKey);
    if (cached) {
      return Promise.resolve({
        ok: true,
        status: 200,
        audio: cached.audio,
        contentType: cached.contentType,
        queueWaitMs: 0,
        latencyMs: 0,
        attempts: 0,
        retriesAttempted: 0,
        cacheHit: true,
      });
    }

    if (queue.length >= maxQueueSize) {
      return Promise.resolve({
        ok: false,
        status: 429,
        errorCode: 'QUEUE_FULL',
        message: 'Speech service queue is full. Fallback active.',
        retryAfterSec: 3,
        queueWaitMs: 0,
        latencyMs: 0,
        attempts: 0,
        retriesAttempted: 0,
        cacheHit: false,
      });
    }

    return new Promise((resolve) => {
      const entry = {
        task: { ...task, sampleRate, enqueuedAt: performance.now() },
        resolve,
        cancelled: false,
        cleanupAbort: null,
      };

      if (task.signal) {
        const onAbort = () => {
          entry.cancelled = true;
          const idx = queue.indexOf(entry);
          if (idx !== -1) queue.splice(idx, 1);
          resolve({
            ok: false,
            status: 499,
            errorCode: 'CLIENT_ABORTED',
            message: 'Speech request cancelled while queued.',
            queueWaitMs: Math.round(performance.now() - entry.task.enqueuedAt),
            latencyMs: 0,
            attempts: 0,
            retriesAttempted: 0,
            cacheHit: false,
          });
        };
        if (task.signal.aborted) {
          onAbort();
          return;
        }
        task.signal.addEventListener('abort', onAbort, { once: true });
        entry.cleanupAbort = () => task.signal.removeEventListener('abort', onAbort);
      }

      queue.push(entry);
      void drain();
    });
  }

  function stats() {
    return { inFlight: running ? 1 : 0, queueDepth: queue.length, cacheSize: cache.size };
  }

  function clearCache() {
    cache.clear();
  }

  return { synthesize, stats, clearCache };
}

export const sharedTimbreQueue = createTimbreQueue();
