import {
  MAX_TTS_BODY_BYTES,
  checkDualRateLimit,
  corsHeaders,
  getClientIp,
  getSameOrigin,
  logApiEvent,
  resolveTtsVoice,
  securityHeaders,
  ttsLimiter,
  ttsUserLimiter,
  validateTtsInput,
} from '../../server/security.mjs';
import { verifySupabaseRequest } from '../../server/auth.mjs';
import { sharedTimbreQueue } from '../../server/timbreQueue.mjs';

function applyHeaders(response, headers) {
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
}

function sendError(response, status, message, extra = {}) {
  return response.status(status).json({ error: message, ...extra });
}

export function createTtsHandler(timbreQueue = sharedTimbreQueue) {
  return async function tts(request, response) {
    const sameOrigin = getSameOrigin(request);
    applyHeaders(response, securityHeaders({
      Allow: 'POST, OPTIONS',
      ...corsHeaders(sameOrigin, 'POST, OPTIONS'),
    }));

    if (request.method === 'OPTIONS') {
      return sameOrigin ? response.status(204).end() : sendError(response, 403, 'Cross-origin requests are not allowed.');
    }
    if (request.method !== 'POST') return sendError(response, 405, 'Method not allowed.');
    if (!sameOrigin) {
      logApiEvent({ event: 'tts_rejected', route: '/api/gnani/tts', status: 403, errorCode: 'CROSS_ORIGIN' });
      return sendError(response, 403, 'Requests must come from this ASHA SAKHI deployment.');
    }

    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return sendError(response, 415, 'Content-Type must be application/json.');
    }

    const contentLength = Number(request.headers['content-length'] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_TTS_BODY_BYTES) {
      return sendError(response, 413, 'Request body is too large.');
    }

    const auth = await verifySupabaseRequest(request);
    if (!auth.ok) {
      logApiEvent({ event: 'tts_auth_rejected', route: '/api/gnani/tts', status: auth.status, errorCode: auth.code });
      response.setHeader('X-Speech-Error-Code', auth.code);
      return sendError(response, auth.status, auth.error, { code: auth.code });
    }

    const ip = getClientIp(request);
    const rate = await checkDualRateLimit({
      ipLimiter: ttsLimiter,
      userLimiter: ttsUserLimiter,
      ip,
      userId: auth.user.userId,
    });
    if (!rate.allowed) {
      logApiEvent({ event: 'tts_rate_limited', route: '/api/gnani/tts', status: 429, errorCode: 'RATE_LIMITED' });
      response.setHeader('Retry-After', String(rate.retryAfterSec));
      response.setHeader('X-Speech-Error-Code', 'RATE_LIMITED');
      return sendError(response, 429, 'Too many speech requests. Please wait a moment and try again.', {
        code: 'RATE_LIMITED',
      });
    }

    const apiKey = process.env.GNANI_API_KEY_ID?.trim();
    if (!apiKey) {
      logApiEvent({ event: 'tts_unconfigured', route: '/api/gnani/tts', status: 503, errorCode: 'NOT_CONFIGURED' });
      response.setHeader('X-Speech-Error-Code', 'NOT_CONFIGURED');
      return sendError(response, 503, 'Gnani speech service is not configured.', { code: 'NOT_CONFIGURED' });
    }

    let body = request.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_TTS_BODY_BYTES) {
        return sendError(response, 413, 'Request body is too large.');
      }
      try { body = JSON.parse(body); } catch { return sendError(response, 400, 'Invalid JSON request.'); }
    } else if (body && typeof body === 'object') {
      if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_TTS_BODY_BYTES) {
        return sendError(response, 413, 'Request body is too large.');
      }
    }

    const validated = validateTtsInput(body);
    if (!validated.ok) return sendError(response, validated.status, validated.error);

    const model = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
    const voice = resolveTtsVoice(validated.language, model);
    const result = await timbreQueue.synthesize({
      apiKey,
      text: validated.text,
      language: validated.language,
      locale: validated.locale,
      model,
      voice,
      speed: validated.speed,
    });

    if (!result.ok) {
      logApiEvent({
        event: 'tts_error',
        route: '/api/gnani/tts',
        status: result.status,
        errorCode: result.errorCode,
        latencyMs: result.latencyMs,
        language: validated.language,
      });
      if (result.retryAfterSec) response.setHeader('Retry-After', String(result.retryAfterSec));
      response.setHeader('X-Speech-Error-Code', result.errorCode);
      response.setHeader('X-Speech-Retries', String(result.retriesAttempted ?? 0));
      response.setHeader('X-Speech-Queue-Wait-Ms', String(result.queueWaitMs ?? 0));
      return sendError(response, result.status, result.message, {
        code: result.errorCode,
        retriesAttempted: result.retriesAttempted ?? 0,
      });
    }

    logApiEvent({
      event: result.cacheHit ? 'tts_cache_hit' : 'tts_ok',
      route: '/api/gnani/tts',
      status: 200,
      latencyMs: result.latencyMs,
      language: validated.language,
    });
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Length', String(result.audio.length));
    response.setHeader('X-Speech-Provider', `Gnani Timbre ${model}`);
    response.setHeader('X-Speech-Latency-Ms', String(result.latencyMs));
    response.setHeader('X-Speech-Queue-Wait-Ms', String(result.queueWaitMs));
    response.setHeader('X-Speech-Attempts', String(result.attempts));
    response.setHeader('X-Speech-Cache', result.cacheHit ? 'hit' : 'miss');
    return response.status(200).send(result.audio);
  };
}

export default createTtsHandler(sharedTimbreQueue);
