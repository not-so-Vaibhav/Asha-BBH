import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  MAX_STT_FRAME_BYTES,
  MAX_STT_SESSION_AUDIO_BYTES,
  MAX_STT_SESSION_MS,
  checkDualRateLimit,
  getClientIp,
  isSameOrigin,
  logApiEvent,
  parseSttControlMessage,
  resolveSttLanguageCode,
  resolveSttMinSilenceMs,
  securityHeaders,
  sttConcurrency,
  sttLimiter,
  sttUserLimiter,
} from '../../server/security.mjs';
import { verifySupabaseRequest } from '../../server/auth.mjs';

const STT_URL = 'wss://api.vachana.ai/stt/v3/stream';

const server = http.createServer((request, response) => {
  const headers = securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    Allow: 'GET',
  });
  if (request.method !== 'GET') {
    response.writeHead(405, headers);
    response.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  response.writeHead(426, headers);
  response.end(JSON.stringify({ error: 'Prisma streaming requires a WebSocket connection.' }));
});

const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: MAX_STT_FRAME_BYTES });

wss.on('connection', async (client, request) => {
  if (!isSameOrigin(request)) {
    logApiEvent({ event: 'stt_rejected', route: '/api/gnani/stt', status: 403, errorCode: 'CROSS_ORIGIN' });
    client.close(1008, 'Requests must come from this ASHA SAKHI deployment');
    return;
  }

  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) {
    logApiEvent({ event: 'stt_auth_rejected', route: '/api/gnani/stt', status: auth.status, errorCode: auth.code });
    client.send(JSON.stringify({ type: 'error', code: auth.code, message: auth.error }));
    client.close(1008, 'Authentication required');
    return;
  }

  const ip = getClientIp(request);
  const rate = await checkDualRateLimit({
    ipLimiter: sttLimiter,
    userLimiter: sttUserLimiter,
    ip,
    userId: auth.user.userId,
  });
  if (!rate.allowed) {
    logApiEvent({ event: 'stt_rate_limited', route: '/api/gnani/stt', status: 429, errorCode: 'RATE_LIMITED' });
    client.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: 'Too many speech sessions. Please wait a moment and try again.' }));
    client.close(1008, 'Rate limit exceeded');
    return;
  }

  if (!sttConcurrency.acquire(ip)) {
    logApiEvent({ event: 'stt_concurrency', route: '/api/gnani/stt', status: 429, errorCode: 'CONCURRENCY_LIMIT' });
    client.send(JSON.stringify({ type: 'error', code: 'CONCURRENCY_LIMIT', message: 'Another speech session is already active. Please wait and try again.' }));
    client.close(1008, 'Too many active sessions');
    return;
  }

  let released = false;
  const releaseSession = () => {
    if (released) return;
    released = true;
    sttConcurrency.release(ip);
  };

  const apiKey = process.env.GNANI_API_KEY_ID?.trim();
  if (!apiKey) {
    releaseSession();
    logApiEvent({ event: 'stt_unconfigured', route: '/api/gnani/stt', status: 503, errorCode: 'NOT_CONFIGURED' });
    client.send(JSON.stringify({ type: 'error', code: 'NOT_CONFIGURED', message: 'Gnani speech service is not configured.' }));
    client.close(1011, 'Speech service not configured');
    return;
  }

  const parsedUrl = new URL(request.url || '/api/gnani/stt', 'http://localhost');
  const { lang, languageCode } = resolveSttLanguageCode(parsedUrl.searchParams.get('language'));
  const minSilenceMs = resolveSttMinSilenceMs(parsedUrl.searchParams.get('minSilenceMs'));
  const sessionStartedAt = performance.now();

  const upstream = new WebSocket(STT_URL, {
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
    if (client.readyState !== WebSocket.OPEN) return;
    const message = response.statusCode === 401 || response.statusCode === 403
      ? 'Speech service authentication failed.'
      : 'Speech transcription service rejected the connection.';
    client.send(JSON.stringify({ type: 'error', code: errorCode, message }));
    client.close(1011, 'Speech service rejected connection');
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

export default server;
