import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import dotenv from 'dotenv';
import WebSocket, { WebSocketServer } from 'ws';
import {
  MAX_STT_FRAME_BYTES,
  MAX_STT_SESSION_AUDIO_BYTES,
  MAX_STT_SESSION_MS,
  MAX_TTS_BODY_BYTES,
  checkDualRateLimit,
  corsHeaders,
  getClientIp,
  getSameOrigin,
  isSameOrigin,
  logApiEvent,
  parseSttControlMessage,
  resolveSttLanguageCode,
  resolveSttMinSilenceMs,
  resolveTtsVoice,
  securityHeaders,
  sttConcurrency,
  sttLimiter,
  sttUserLimiter,
  ttsLimiter,
  ttsUserLimiter,
  validateTtsInput,
} from './security.mjs';
import { isAuthEnforced, verifySupabaseRequest } from './auth.mjs';
import { TIMBRE_TTS_URL, createTimbreQueue } from './timbreQueue.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(here, '../dist');
const port = Number(process.env.API_PORT || 4174);
const STT_URL = 'wss://api.vachana.ai/stt/v3/stream';
const TTS_URL = TIMBRE_TTS_URL;

function getConfig() {
  const apiKey = process.env.GNANI_API_KEY_ID?.trim();
  const ttsModel = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
  const ttsVoice = resolveTtsVoice('en', ttsModel);
  return { apiKey, ttsModel, ttsVoice };
}

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, securityHeaders({ 'content-type': 'application/json; charset=utf-8', ...extraHeaders }));
  res.end(JSON.stringify(data));
}

async function readJson(req, maxBytes = MAX_TTS_BODY_BYTES) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const err = new Error('Request body is too large.');
    err.status = 413;
    throw err;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('Request body is too large.');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON request.');
    err.status = 400;
    throw err;
  }
}

function serveBuiltApp(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const candidate = path.resolve(distRoot, `.${requestPath}`);
  const safePath = candidate.startsWith(distRoot + path.sep) || candidate === path.join(distRoot, 'index.html');
  const file = safePath && existsSync(candidate) && statSync(candidate).isFile() ? candidate : path.join(distRoot, 'index.html');
  if (!existsSync(file)) {
    json(res, 404, { error: 'Built app not found. Run npm run build first.' });
    return;
  }
  const ext = path.extname(file);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
  };
  const compressible = new Set(['.html', '.js', '.css', '.txt', '.svg', '.webmanifest']);
  const acceptsGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
  const headers = {
    'content-type': types[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' || path.basename(file) === 'sw.js' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  if (compressible.has(ext) && acceptsGzip) {
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
    res.writeHead(200, headers);
    createReadStream(file).pipe(createGzip()).pipe(res);
    return;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

export function createAppServer({ fetchImpl = fetch, sttUrl = STT_URL, ttsUrl = TTS_URL, timbreQueueOptions = {} } = {}) {
  const timbreQueue = createTimbreQueue({ fetchImpl, ttsUrl, ...timbreQueueOptions });
  const server = http.createServer(async (req, res) => {
    const { apiKey, ttsModel, ttsVoice } = getConfig();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      }
      const payload = {
        status: 'ok',
        service: 'asha-sakhi',
        gnaniConfigured: Boolean(apiKey),
        supabaseConfigured: Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim()),
        authEnforced: isAuthEnforced(),
        rateLimitStore: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) ? 'kv' : 'memory',
        timestamp: new Date().toISOString(),
      };
      if (req.method === 'HEAD') {
        res.writeHead(200, securityHeaders({ 'content-type': 'application/json; charset=utf-8', Allow: 'GET, HEAD' }));
        res.end();
        return;
      }
      return json(res, 200, payload, { Allow: 'GET, HEAD' });
    }

    if (url.pathname === '/api/gnani/status') {
      const sameOrigin = getSameOrigin(req);
      const extra = { Allow: 'GET, OPTIONS', ...corsHeaders(sameOrigin, 'GET, OPTIONS') };
      if (req.method === 'OPTIONS') {
        if (!sameOrigin) return json(res, 403, { error: 'Cross-origin requests are not allowed.' }, extra);
        res.writeHead(204, securityHeaders(extra));
        res.end();
        return;
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' }, extra);
      return json(res, 200, { configured: Boolean(apiKey), sttModel: 'prisma-v3.0', ttsModel, ttsVoice }, extra);
    }

    if (url.pathname === '/api/gnani/tts') {
      const sameOrigin = getSameOrigin(req);
      const extra = { Allow: 'POST, OPTIONS', ...corsHeaders(sameOrigin, 'POST, OPTIONS') };
      if (req.method === 'OPTIONS') {
        if (!sameOrigin) return json(res, 403, { error: 'Cross-origin requests are not allowed.' }, extra);
        res.writeHead(204, securityHeaders(extra));
        res.end();
        return;
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' }, extra);
      if (!sameOrigin) {
        logApiEvent({ event: 'tts_rejected', route: '/api/gnani/tts', status: 403, errorCode: 'CROSS_ORIGIN' });
        return json(res, 403, { error: 'Requests must come from this ASHA SAKHI deployment.' }, extra);
      }

      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        return json(res, 415, { error: 'Content-Type must be application/json.' }, extra);
      }

      const auth = await verifySupabaseRequest(req, { fetchImpl });
      if (!auth.ok) {
        logApiEvent({ event: 'tts_auth_rejected', route: '/api/gnani/tts', status: auth.status, errorCode: auth.code });
        return json(res, auth.status, { error: auth.error, code: auth.code }, { ...extra, 'X-Speech-Error-Code': auth.code });
      }

      const rate = await checkDualRateLimit({
        ipLimiter: ttsLimiter,
        userLimiter: ttsUserLimiter,
        ip: getClientIp(req),
        userId: auth.user.userId,
      });
      if (!rate.allowed) {
        logApiEvent({ event: 'tts_rate_limited', route: '/api/gnani/tts', status: 429, errorCode: 'RATE_LIMITED' });
        return json(
          res,
          429,
          { error: 'Too many speech requests. Please wait a moment and try again.', code: 'RATE_LIMITED' },
          { ...extra, 'Retry-After': String(rate.retryAfterSec), 'X-Speech-Error-Code': 'RATE_LIMITED' },
        );
      }

      if (!apiKey) {
        logApiEvent({ event: 'tts_unconfigured', route: '/api/gnani/tts', status: 503, errorCode: 'NOT_CONFIGURED' });
        return json(
          res,
          503,
          { error: 'Gnani speech service is not configured.', code: 'NOT_CONFIGURED' },
          { ...extra, 'X-Speech-Error-Code': 'NOT_CONFIGURED' },
        );
      }

      let body;
      try {
        body = await readJson(req);
      } catch (error) {
        return json(res, error?.status || 400, { error: error?.message || 'Invalid JSON request.' }, extra);
      }

      const validated = validateTtsInput(body);
      if (!validated.ok) return json(res, validated.status, { error: validated.error }, extra);

      const abortController = new AbortController();
      const onClientClose = () => {
        if (!res.writableEnded) abortController.abort();
      };
      res.once('close', onClientClose);

      const voice = resolveTtsVoice(validated.language, ttsModel);
      const result = await timbreQueue.synthesize({
        apiKey,
        text: validated.text,
        language: validated.language,
        locale: validated.locale,
        model: ttsModel,
        voice,
        speed: validated.speed,
        signal: abortController.signal,
      });
      res.off('close', onClientClose);
      if (res.writableEnded || res.destroyed) return;

      if (!result.ok) {
        logApiEvent({
          event: 'tts_error',
          route: '/api/gnani/tts',
          status: result.status,
          errorCode: result.errorCode,
          latencyMs: result.latencyMs,
          language: validated.language,
        });
        const errHeaders = {
          ...extra,
          'x-speech-error-code': result.errorCode,
          'x-speech-retries': String(result.retriesAttempted ?? 0),
          'x-speech-queue-wait-ms': String(result.queueWaitMs ?? 0),
          ...(result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : {}),
        };
        return json(
          res,
          result.status === 499 ? 499 : result.status,
          { error: result.message, code: result.errorCode, retriesAttempted: result.retriesAttempted ?? 0 },
          errHeaders,
        );
      }

      logApiEvent({
        event: result.cacheHit ? 'tts_cache_hit' : 'tts_ok',
        route: '/api/gnani/tts',
        status: 200,
        latencyMs: result.latencyMs,
        language: validated.language,
      });
      res.writeHead(200, securityHeaders({
        ...extra,
        'content-type': result.contentType,
        'content-length': String(result.audio.length),
        'x-speech-provider': `Gnani Timbre ${ttsModel}`,
        'x-speech-latency-ms': String(result.latencyMs),
        'x-speech-queue-wait-ms': String(result.queueWaitMs),
        'x-speech-attempts': String(result.attempts),
        'x-speech-cache': result.cacheHit ? 'hit' : 'miss',
      }));
      res.end(result.audio);
      return;
    }

    if (url.pathname === '/api/gnani/stt') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
      return json(res, 426, { error: 'Prisma streaming requires a WebSocket connection.' }, { Allow: 'GET' });
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API endpoint.' });
    if (req.method === 'GET' || req.method === 'HEAD') return serveBuiltApp(req, res);
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  });

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: MAX_STT_FRAME_BYTES });
  server.on('upgrade', async (req, socket, head) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    if (parsedUrl.pathname !== '/api/gnani/stt') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!isSameOrigin(req)) {
      logApiEvent({ event: 'stt_rejected', route: '/api/gnani/stt', status: 403, errorCode: 'CROSS_ORIGIN' });
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const auth = await verifySupabaseRequest(req, { fetchImpl });
    if (!auth.ok) {
      logApiEvent({ event: 'stt_auth_rejected', route: '/api/gnani/stt', status: auth.status, errorCode: auth.code });
      socket.write(`HTTP/1.1 ${auth.status} Unauthorized\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    const ip = getClientIp(req);
    const rate = await checkDualRateLimit({
      ipLimiter: sttLimiter,
      userLimiter: sttUserLimiter,
      ip,
      userId: auth.user.userId,
    });
    if (!rate.allowed) {
      logApiEvent({ event: 'stt_rate_limited', route: '/api/gnani/stt', status: 429, errorCode: 'RATE_LIMITED' });
      socket.write(`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${rate.retryAfterSec}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    const { apiKey } = getConfig();
    if (!apiKey) {
      logApiEvent({ event: 'stt_unconfigured', route: '/api/gnani/stt', status: 503, errorCode: 'NOT_CONFIGURED' });
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!sttConcurrency.acquire(ip)) {
      logApiEvent({ event: 'stt_concurrency', route: '/api/gnani/stt', status: 429, errorCode: 'CONCURRENCY_LIMIT' });
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const { lang, languageCode } = resolveSttLanguageCode(parsedUrl.searchParams.get('language'));
    const minSilenceMs = resolveSttMinSilenceMs(parsedUrl.searchParams.get('minSilenceMs'));
    const sessionStartedAt = performance.now();

    wss.handleUpgrade(req, socket, head, (client) => {
      let released = false;
      const releaseSession = () => {
        if (released) return;
        released = true;
        sttConcurrency.release(ip);
      };

      const upstream = new WebSocket(sttUrl, {
        perMessageDeflate: false,
        handshakeTimeout: 12_000,
        headers: {
          'x-api-key-id': apiKey,
          model: 'prisma-v3.0',
          language_code: languageCode,
          format: 'codemix',
          'x-sample-rate': '16000',
          'x-vad-threshold': '0.5',
          'x-min-silence-ms': minSilenceMs,
          'x-idle-timeout-sec': '120',
        },
      });
      let upstreamOpen = false;
      let closing = false;
      let totalAudioBytes = 0;

      const sessionTimer = setTimeout(() => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'error', code: 'SESSION_DURATION_LIMIT', message: 'Speech session duration limit reached.' }));
          client.close(1000, 'Session duration limit reached');
        }
        if (upstream.readyState < WebSocket.CLOSING) upstream.close(1000, 'Session duration limit reached');
      }, MAX_STT_SESSION_MS);
      sessionTimer.unref?.();

      const heartbeatTimer = setInterval(() => {
        if (upstream.readyState === WebSocket.OPEN) {
          try { upstream.ping(); } catch {}
        }
      }, 25_000);
      heartbeatTimer.unref?.();

      const cleanupTimers = () => {
        clearTimeout(sessionTimer);
        clearInterval(heartbeatTimer);
        releaseSession();
      };

      client.on('message', (data, isBinary) => {
        if (isBinary) {
          const byteLength = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
          totalAudioBytes += byteLength;
          if (totalAudioBytes > MAX_STT_SESSION_AUDIO_BYTES) {
            logApiEvent({ event: 'stt_error', route: '/api/gnani/stt', status: 1009, errorCode: 'AUDIO_LIMIT', latencyMs: performance.now() - sessionStartedAt, language: lang });
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'error', code: 'AUDIO_LIMIT', message: 'Audio session size limit reached.' }));
              client.close(1009, 'Audio size limit reached');
            }
            if (upstream.readyState < WebSocket.CLOSING) upstream.close(1000, 'Audio size limit reached');
            return;
          }
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: true });
          return;
        }
        const text = typeof data === 'string' ? data : data.toString('utf8');
        const control = parseSttControlMessage(text);
        if (!control) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'error', code: 'INVALID_CONTROL', message: 'Invalid control message.' }));
            client.close(1008, 'Invalid control message');
          }
          if (upstream.readyState < WebSocket.CLOSING) upstream.close(1008, 'Invalid control message');
          return;
        }
        if (control.type === 'ping') {
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          return;
        }
        if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ type: 'commit' }), { binary: false });
      });

      upstream.on('open', () => {
        upstreamOpen = true;
        logApiEvent({ event: 'stt_open', route: '/api/gnani/stt', status: 101, latencyMs: performance.now() - sessionStartedAt, language: lang });
      });
      upstream.on('message', (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
      });
      upstream.on('unexpected-response', (_request, response) => {
        const errorCode = response.statusCode === 401 || response.statusCode === 403 ? 'UPSTREAM_AUTH' : `UPSTREAM_${response.statusCode || 'HTTP'}`;
        logApiEvent({ event: 'stt_error', route: '/api/gnani/stt', status: response.statusCode || 502, errorCode, latencyMs: performance.now() - sessionStartedAt, language: lang });
        if (client.readyState === WebSocket.OPEN) {
          const message = response.statusCode === 401 || response.statusCode === 403
            ? 'Speech service authentication failed.'
            : 'Speech transcription service rejected the connection.';
          client.send(JSON.stringify({ type: 'error', code: errorCode, message }));
          client.close(1011, 'Speech service rejected connection');
        }
      });
      upstream.on('error', () => {
        logApiEvent({ event: 'stt_error', route: '/api/gnani/stt', status: 502, errorCode: 'UPSTREAM_WS_ERROR', latencyMs: performance.now() - sessionStartedAt, language: lang });
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'error', code: 'UPSTREAM_WS_ERROR', message: 'Speech transcription service is temporarily unavailable.' }));
          client.close(1011, 'Speech service unavailable');
        }
      });
      client.on('close', () => {
        cleanupTimers();
        if (closing) return;
        closing = true;
        logApiEvent({ event: 'stt_close', route: '/api/gnani/stt', status: 1000, latencyMs: performance.now() - sessionStartedAt, language: lang });
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify({ type: 'commit' }));
          const timer = setTimeout(() => upstream.close(1000, 'Client ended session'), 1_200);
          timer.unref?.();
        } else if (upstream.readyState === WebSocket.CONNECTING) {
          upstream.close();
        }
      });
      upstream.on('close', (code, reason) => {
        cleanupTimers();
        if (closing) return;
        closing = true;
        logApiEvent({ event: 'stt_upstream_close', route: '/api/gnani/stt', status: code, latencyMs: performance.now() - sessionStartedAt, language: lang });
        if (client.readyState === WebSocket.OPEN) {
          client.close(upstreamOpen ? code : 1011, reason?.toString() || 'Speech session ended');
        }
      });
    });
  });

  return server;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const { apiKey } = getConfig();
  const server = createAppServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`[ASHA SAKHI API] Listening on http://127.0.0.1:${port}; Gnani key ${apiKey ? 'configured' : 'not configured'}.`);
  });
}
