import { z } from 'zod';

export const MAX_TTS_BODY_BYTES = 16_384;
export const MAX_TTS_TEXT_CHARS = 4_000;
export const MAX_TTS_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_STT_FRAME_BYTES = 64 * 1024;
export const MAX_STT_SESSION_AUDIO_BYTES = 6 * 1024 * 1024; // ~3 min of 16 kHz mono PCM16
export const MAX_STT_SESSION_MS = 180_000;
export const MAX_STT_CONCURRENT_PER_IP = 4; // allows reconnects & shared venue Wi-Fi NAT
export const DEFAULT_TTS_RATE_LIMIT = 60; // 60/min per user covers normal judge testing & 3-min demo
export const DEFAULT_TTS_IP_RATE_LIMIT = 120; // higher IP limit for shared venue Wi-Fi NAT
export const DEFAULT_STT_RATE_LIMIT = 20; // 20 sessions/min per user covers reconnects
export const DEFAULT_STT_IP_RATE_LIMIT = 40; // higher IP limit for shared venue Wi-Fi NAT

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1, `Text must be between 1 and ${MAX_TTS_TEXT_CHARS} characters.`).max(MAX_TTS_TEXT_CHARS, `Text must be between 1 and ${MAX_TTS_TEXT_CHARS} characters.`),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
  purpose: z.enum(['readback', 'alert']).optional().default('readback'),
  speed: z.number().finite().min(0.75).max(1.25).optional(),
});

export const ALLOWED_LANGUAGES = Object.freeze({
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
});

/**
 * Official Prisma v3.0 WebSocket language_code values (single locale required by wss://api.vachana.ai/stt/v3/stream).
 * Paired with format=codemix so embedded English clinical terms (ANC, kg, BEN-1001) are preserved.
 */
export const STT_LANGUAGE_CODES = Object.freeze({
  en: 'indic-auto',
  hi: 'hi-IN',
  mr: 'mr-IN',
});

export function resolveSttLanguageCode(rawLang) {
  const lang = typeof rawLang === 'string' && Object.hasOwn(STT_LANGUAGE_CODES, rawLang) ? rawLang : 'en';
  return { lang, languageCode: STT_LANGUAGE_CODES[lang] };
}

/** Official Gnani Prisma v3.0 x-min-silence-ms range is 100-2000 ms (default 600 ms for conversational speech). */
export function resolveSttMinSilenceMs(rawValue, defaultMs = 600) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return String(defaultMs);
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 2000) return String(defaultMs);
  return String(parsed);
}

export function resolveTtsVoice(language, model = process.env.GNANI_TTS_MODEL || 'timbre-v3.0') {
  const suffix = typeof language === 'string' ? language.toUpperCase() : 'EN';
  const perLang = process.env[`GNANI_TTS_VOICE_${suffix}`]?.trim();
  if (perLang) return perLang;
  return process.env.GNANI_TTS_VOICE?.trim() || (model === 'timbre-v3.0' ? 'Shivani' : 'Kaveri');
}

export function resolveTtsSpeed(rawSpeed, purpose) {
  if (typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) && rawSpeed >= 0.75 && rawSpeed <= 1.25) {
    return Number(rawSpeed.toFixed(2));
  }
  return purpose === 'alert' ? 1.0 : 0.95;
}

/** Structured operational log: latency & error codes ONLY. Never logs keys, audio, or transcripts. */
export function logApiEvent({ event, route, status, errorCode = null, latencyMs = null, language = null }) {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const entry = {
    ts: new Date().toISOString(),
    event,
    route,
    status,
    ...(errorCode ? { errorCode } : {}),
    ...(typeof latencyMs === 'number' ? { latencyMs: Math.round(latencyMs) } : {}),
    ...(language ? { language } : {}),
  };
  console.info(JSON.stringify(entry));
}

export function getClientIp(request) {
  const forwarded = request.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return request.socket?.remoteAddress || 'unknown';
}

export function getSameOrigin(request) {
  const origin = request.headers?.origin;
  const rawHost = request.headers?.['x-forwarded-host'] || request.headers?.host;
  const host = typeof rawHost === 'string' ? rawHost.split(',')[0].trim() : '';
  if (!origin || !host) return null;
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.host !== host) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(request) {
  return getSameOrigin(request) !== null;
}

export function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    ...extra,
  };
}

export function corsHeaders(origin, methods, allowHeaders = 'Content-Type, Authorization') {
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowHeaders,
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function validateTtsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Invalid request payload.' };
  }
  if (typeof body.language === 'string' && !Object.hasOwn(ALLOWED_LANGUAGES, body.language)) {
    return { ok: false, status: 400, error: 'Unsupported language.' };
  }
  const parsed = ttsRequestSchema.safeParse({
    text: body.text,
    language: body.language ?? 'en',
    purpose: body.purpose === 'alert' ? 'alert' : 'readback',
    speed: typeof body.speed === 'number' && Number.isFinite(body.speed) && body.speed >= 0.75 && body.speed <= 1.25 ? body.speed : undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, status: 400, error: issue?.message || 'Invalid request payload.' };
  }
  const { text, language, purpose } = parsed.data;
  const speed = resolveTtsSpeed(parsed.data.speed, purpose);
  return { ok: true, text, language, locale: ALLOWED_LANGUAGES[language], purpose, speed };
}

export function parseSttControlMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 256) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.type === 'commit' || parsed.type === 'ping') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function isValidSttControlMessage(raw) {
  return parseSttControlMessage(raw) !== null;
}

export function createRateLimiter({
  windowMs = Number(process.env.GNANI_RATE_WINDOW_MS || 60_000),
  max = DEFAULT_TTS_RATE_LIMIT,
  maxEnvVar = null,
  maxKeys = 2_000,
  namespace = 'default',
  fetchImpl = fetch,
} = {}) {
  const hits = new Map();
  const effectiveMax = () => (maxEnvVar && process.env[maxEnvVar] ? Number(process.env[maxEnvVar]) : max);

  function checkMemory(key, now = Date.now()) {
    const limit = effectiveMax();
    const cutoff = now - windowMs;
    const list = (hits.get(key) || []).filter((ts) => ts > cutoff);
    if (list.length >= limit) {
      const oldest = list[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      hits.set(key, list);
      return { allowed: false, remaining: 0, retryAfterSec, backend: 'memory' };
    }
    list.push(now);
    if (!hits.has(key) && hits.size >= maxKeys) {
      const firstKey = hits.keys().next().value;
      if (firstKey !== undefined) hits.delete(firstKey);
    }
    hits.set(key, list);
    return { allowed: true, remaining: Math.max(0, limit - list.length), retryAfterSec: 0, backend: 'memory' };
  }

  /**
   * Uses shared Upstash / Vercel KV REST Redis when configured (KV_REST_API_URL + KV_REST_API_TOKEN
   * or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) so limits apply across serverless instances.
   * Falls back cleanly to in-memory per-instance limiting when unconfigured or unreachable.
   */
  async function checkShared(key, now = Date.now()) {
    const kvUrl = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
    const kvToken = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
    if (!kvUrl || !kvToken) return checkMemory(key, now);

    const limit = effectiveMax();
    const windowBucket = Math.floor(now / windowMs);
    const redisKey = `asha:rl:${namespace}:${key}:${windowBucket}`;
    const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
    try {
      const res = await fetchImpl(`${kvUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, ttlSec],
        ]),
        signal: AbortSignal.timeout(1_500),
      });
      if (!res.ok) return checkMemory(key, now);
      const data = await res.json();
      const count = Number(data?.[0]?.result ?? 0);
      if (!Number.isFinite(count) || count <= 0) return checkMemory(key, now);
      if (count > limit) {
        const retryAfterSec = Math.max(1, Math.ceil(((windowBucket + 1) * windowMs - now) / 1000));
        return { allowed: false, remaining: 0, retryAfterSec, backend: 'kv' };
      }
      return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSec: 0, backend: 'kv' };
    } catch {
      return checkMemory(key, now);
    }
  }

  function reset() {
    hits.clear();
  }

  return { check: checkMemory, checkShared, reset };
}

export function createConcurrencyTracker(maxPerIp = MAX_STT_CONCURRENT_PER_IP) {
  const active = new Map();

  function acquire(key) {
    const current = active.get(key) || 0;
    if (current >= maxPerIp) return false;
    active.set(key, current + 1);
    return true;
  }

  function release(key) {
    const current = active.get(key) || 0;
    if (current <= 1) active.delete(key);
    else active.set(key, current - 1);
  }

  function reset() {
    active.clear();
  }

  return { acquire, release, reset };
}

export const ttsLimiter = createRateLimiter({
  max: DEFAULT_TTS_RATE_LIMIT,
  maxEnvVar: 'GNANI_TTS_RATE_LIMIT',
  namespace: 'tts',
});

export const ttsUserLimiter = createRateLimiter({
  max: DEFAULT_TTS_RATE_LIMIT,
  maxEnvVar: 'GNANI_TTS_USER_RATE_LIMIT',
  namespace: 'tts-user',
});

export const sttLimiter = createRateLimiter({
  max: DEFAULT_STT_RATE_LIMIT,
  maxEnvVar: 'GNANI_STT_RATE_LIMIT',
  namespace: 'stt',
});

export const sttUserLimiter = createRateLimiter({
  max: DEFAULT_STT_RATE_LIMIT,
  maxEnvVar: 'GNANI_STT_USER_RATE_LIMIT',
  namespace: 'stt-user',
});

export const sttConcurrency = createConcurrencyTracker();

export async function checkDualRateLimit({ ipLimiter, userLimiter, ip, userId }) {
  const ipRate = await ipLimiter.checkShared(`ip:${ip}`);
  if (!ipRate.allowed) return { ...ipRate, scope: 'ip' };
  if (userId && userId !== 'local-preview') {
    const userRate = await userLimiter.checkShared(`user:${userId}`);
    if (!userRate.allowed) return { ...userRate, scope: 'user' };
    return { ...userRate, scope: 'user' };
  }
  return { ...ipRate, scope: 'ip' };
}

export function resetRateLimiters() {
  ttsLimiter.reset();
  ttsUserLimiter.reset();
  sttLimiter.reset();
  sttUserLimiter.reset();
  sttConcurrency.reset();
}
