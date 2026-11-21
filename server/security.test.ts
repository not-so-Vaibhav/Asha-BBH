import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  MAX_STT_SESSION_AUDIO_BYTES,
  MAX_TTS_BODY_BYTES,
  createRateLimiter,
  isValidSttControlMessage,
  resetRateLimiters,
  resolveSttMinSilenceMs,
  validateTtsInput,
} from './security.mjs';
import { createAppServer } from './index.mjs';
import healthHandler from '../api/health.js';
import statusHandler from '../api/gnani/status.js';
import ttsHandler from '../api/gnani/tts.js';

function mockVercelRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = String(v); },
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    send(data: unknown) { body = data; return res; },
    end() { return res; },
    get result() { return { statusCode, headers, body }; },
  };
  return res;
}

describe('server security utilities', () => {
  beforeEach(() => resetRateLimiters());

  it('validates TTS input strictly', () => {
    expect(validateTtsInput(null).ok).toBe(false);
    expect(validateTtsInput({ text: '   ', language: 'en' }).ok).toBe(false);
    expect(validateTtsInput({ text: 'a'.repeat(4001), language: 'en' }).ok).toBe(false);
    expect(validateTtsInput({ text: 'hello', language: 'fr' }).ok).toBe(false);
    expect(validateTtsInput({ text: 'hello', language: 'mr' })).toEqual({
      ok: true,
      text: 'hello',
      language: 'mr',
      locale: 'mr-IN',
      purpose: 'readback',
      speed: 0.95,
    });
  });

  it('validates STT control messages strictly', () => {
    expect(isValidSttControlMessage(JSON.stringify({ type: 'commit' }))).toBe(true);
    expect(isValidSttControlMessage(JSON.stringify({ type: 'ping' }))).toBe(true);
    expect(isValidSttControlMessage(JSON.stringify({ type: 'hack' }))).toBe(false);
    expect(isValidSttControlMessage('not-json')).toBe(false);
    expect(isValidSttControlMessage('x'.repeat(300))).toBe(false);
  });

  it('uses shared KV/Upstash REST rate limiter when configured and falls back cleanly', async () => {
    const prevUrl = process.env.KV_REST_API_URL;
    const prevToken = process.env.KV_REST_API_TOKEN;
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 'test-kv-token';
    try {
      let count = 0;
      const mockKvFetch = async () => {
        count += 1;
        return new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 });
      };
      const limiter = createRateLimiter({ windowMs: 60_000, max: 2, namespace: 'test', fetchImpl: mockKvFetch as typeof fetch });
      expect((await limiter.checkShared('1.2.3.4')).backend).toBe('kv');
      expect((await limiter.checkShared('1.2.3.4')).allowed).toBe(true);
      const blocked = await limiter.checkShared('1.2.3.4');
      expect(blocked.allowed).toBe(false);
      expect(blocked.backend).toBe('kv');
    } finally {
      if (prevUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = prevUrl;
      if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = prevToken;
    }
  });

  it('enforces per-IP rate limiting with retryAfterSec', () => {
    const limiter = createRateLimiter({ windowMs: 10_000, max: 2 });
    expect(limiter.check('1.2.3.4', 1_000).allowed).toBe(true);
    expect(limiter.check('1.2.3.4', 2_000).allowed).toBe(true);
    const blocked = limiter.check('1.2.3.4', 3_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(limiter.check('5.6.7.8', 3_000).allowed).toBe(true);
    expect(limiter.check('1.2.3.4', 12_000).allowed).toBe(true);
  });
});

describe('Vercel API route handlers', () => {
  const originalKey = process.env.GNANI_API_KEY_ID;
  beforeEach(() => {
    resetRateLimiters();
    process.env.GNANI_API_KEY_ID = 'test-secret-key-never-expose';
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.GNANI_API_KEY_ID;
    else process.env.GNANI_API_KEY_ID = originalKey;
  });

  it('/api/health returns 200 on GET and 405 on POST without exposing secrets', () => {
    const getRes = mockVercelRes();
    healthHandler({ method: 'GET', headers: {} }, getRes);
    expect(getRes.result.statusCode).toBe(200);
    expect(getRes.result.body).toMatchObject({ status: 'ok', service: 'asha-sakhi', gnaniConfigured: true, rateLimitStore: 'memory' });
    expect(JSON.stringify(getRes.result.body)).not.toContain('test-secret-key-never-expose');
    expect(resolveSttMinSilenceMs('300')).toBe('300');
    expect(resolveSttMinSilenceMs('9999')).toBe('600');

    const postRes = mockVercelRes();
    healthHandler({ method: 'POST', headers: {} }, postRes);
    expect(postRes.result.statusCode).toBe(405);
  });

  it('/api/gnani/status restricts methods and never exposes API key', () => {
    const res = mockVercelRes();
    statusHandler({ method: 'GET', headers: { host: 'app.example', origin: 'https://app.example' } }, res);
    expect(res.result.statusCode).toBe(200);
    expect(res.result.body).toMatchObject({ configured: true, sttModel: 'prisma-v3.0' });
    expect(JSON.stringify(res.result.body)).not.toContain('test-secret-key-never-expose');

    const badMethod = mockVercelRes();
    statusHandler({ method: 'DELETE', headers: {} }, badMethod);
    expect(badMethod.result.statusCode).toBe(405);
  });

  it('/api/gnani/tts enforces method, origin, content-type, size, and rate limits', async () => {
    const baseHeaders = {
      host: 'app.example',
      origin: 'https://app.example',
      'content-type': 'application/json',
      'x-forwarded-for': '10.0.0.1',
    };

    const badMethod = mockVercelRes();
    await ttsHandler({ method: 'GET', headers: baseHeaders }, badMethod);
    expect(badMethod.result.statusCode).toBe(405);

    const crossOrigin = mockVercelRes();
    await ttsHandler({ method: 'POST', headers: { ...baseHeaders, origin: 'https://evil.example' }, body: { text: 'hi', language: 'en' } }, crossOrigin);
    expect(crossOrigin.result.statusCode).toBe(403);

    const badContentType = mockVercelRes();
    await ttsHandler({ method: 'POST', headers: { ...baseHeaders, 'content-type': 'text/plain' }, body: 'hi' }, badContentType);
    expect(badContentType.result.statusCode).toBe(415);

    const tooLarge = mockVercelRes();
    await ttsHandler({
      method: 'POST',
      headers: { ...baseHeaders, 'content-length': String(MAX_TTS_BODY_BYTES + 10) },
      body: { text: 'hi', language: 'en' },
    }, tooLarge);
    expect(tooLarge.result.statusCode).toBe(413);

    const invalidLang = mockVercelRes();
    await ttsHandler({ method: 'POST', headers: baseHeaders, body: { text: 'hi', language: 'xx' } }, invalidLang);
    expect(invalidLang.result.statusCode).toBe(400);
  });
});

describe('local Node proxy server endpoints', () => {
  const originalKey = process.env.GNANI_API_KEY_ID;
  let server: http.Server;
  let baseUrl: string;
  let hostHeader: string;
  let upstreamWss: WebSocketServer;
  let upstreamUrl: string;

  beforeEach(async () => {
    resetRateLimiters();
    process.env.GNANI_API_KEY_ID = 'unit-test-key-secret';

    upstreamWss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => upstreamWss.once('listening', resolve));
    const upAddr = upstreamWss.address() as { port: number };
    upstreamUrl = `ws://127.0.0.1:${upAddr.port}`;
    upstreamWss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'connected' }));
      ws.on('message', (data, isBinary) => {
        if (isBinary) ws.send(JSON.stringify({ type: 'transcript', text: 'Weight 55 kilo' }));
      });
    });

    const mockFetch = async () =>
      new Response(Buffer.from('RIFF....WAVEfmt '), {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      });

    server = createAppServer({ fetchImpl: mockFetch as typeof fetch, sttUrl: upstreamUrl });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    hostHeader = `127.0.0.1:${addr.port}`;
    baseUrl = `http://${hostHeader}`;
  });

  afterEach(async () => {
    if (originalKey === undefined) delete process.env.GNANI_API_KEY_ID;
    else process.env.GNANI_API_KEY_ID = originalKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamWss.close(() => resolve()));
  });

  it('serves /api/health and rejects non-GET methods', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ status: 'ok', service: 'asha-sakhi', gnaniConfigured: true });
    expect(JSON.stringify(data)).not.toContain('unit-test-key-secret');

    const bad = await fetch(`${baseUrl}/api/health`, { method: 'POST' });
    expect(bad.status).toBe(405);
  });

  it('serves /api/gnani/tts for same-origin and blocks cross-origin and rate-limit abuse', async () => {
    const cross = await fetch(`${baseUrl}/api/gnani/tts`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', language: 'en' }),
    });
    expect(cross.status).toBe(403);

    const ok = await fetch(`${baseUrl}/api/gnani/tts`, {
      method: 'POST',
      headers: { origin: baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', language: 'en' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('audio/wav');

    // Hit rate limit (default 60/min)
    let hit429 = false;
    for (let i = 0; i < 65; i++) {
      const r = await fetch(`${baseUrl}/api/gnani/tts`, {
        method: 'POST',
        headers: { origin: baseUrl, 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Hello', language: 'en' }),
      });
      if (r.status === 429) {
        hit429 = true;
        expect(Number(r.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
        break;
      }
    }
    expect(hit429).toBe(true);
  });

  it('proxies /api/gnani/stt WebSocket for same-origin and rejects cross-origin & oversized audio', async () => {
    // Plain HTTP GET returns 426
    const plain = await fetch(`${baseUrl}/api/gnani/stt`);
    expect(plain.status).toBe(426);

    // Cross-origin WS rejected
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://${hostHeader}/api/gnani/stt`, { origin: 'https://evil.example' });
        ws.on('open', () => reject(new Error('Should not open cross-origin WS')));
        ws.on('unexpected-response', (_req, res) => {
          expect(res.statusCode).toBe(403);
          resolve();
        });
      }),
    ).resolves.toBeUndefined();

    // Same-origin WS streams binary audio and receives transcript
    const received = await new Promise<string[]>((resolve, reject) => {
      const msgs: string[] = [];
      const ws = new WebSocket(`ws://${hostHeader}/api/gnani/stt`, { origin: baseUrl });
      ws.on('error', reject);
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed.type);
        if (parsed.type === 'connected') ws.send(Buffer.alloc(1024));
        if (parsed.type === 'transcript') {
          expect(parsed.text).toBe('Weight 55 kilo');
          ws.close();
          resolve(msgs);
        }
      });
    });
    expect(received).toEqual(['connected', 'transcript']);

    // Oversized cumulative audio closes with 1009
    const closeCode = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://${hostHeader}/api/gnani/stt`, { origin: baseUrl });
      ws.on('error', reject);
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'connected') {
          const chunk = Buffer.alloc(32 * 1024);
          const count = Math.ceil(MAX_STT_SESSION_AUDIO_BYTES / chunk.length) + 2;
          for (let i = 0; i < count; i++) {
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          }
        }
      });
      ws.on('close', (code) => resolve(code));
    });
    expect(closeCode).toBe(1009);
  });

  it('rejects unauthenticated /api/gnani/tts and /api/gnani/stt when auth is enforced and accepts valid JWT with per-user rate limiting', async () => {
    const { SignJWT } = await import('jose');
    const prevRequire = process.env.REQUIRE_AUTH;
    const prevSecret = process.env.SUPABASE_JWT_SECRET;
    const prevUserLimit = process.env.GNANI_TTS_USER_RATE_LIMIT;
    const secret = 'test-super-secret-supabase-jwt-signing-key-32-chars';
    process.env.REQUIRE_AUTH = 'true';
    process.env.SUPABASE_JWT_SECRET = secret;
    process.env.GNANI_TTS_USER_RATE_LIMIT = '2';
    resetRateLimiters();

    try {
      // Missing token on TTS -> 401
      const noAuthRes = await fetch(`${baseUrl}/api/gnani/tts`, {
        method: 'POST',
        headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello', language: 'en' }),
      });
      expect(noAuthRes.status).toBe(401);

      // Invalid token on TTS -> 401
      const badAuthRes = await fetch(`${baseUrl}/api/gnani/tts`, {
        method: 'POST',
        headers: { Origin: baseUrl, 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-jwt' },
        body: JSON.stringify({ text: 'Hello', language: 'en' }),
      });
      expect(badAuthRes.status).toBe(401);

      // Missing token on STT WebSocket upgrade -> 401
      await expect(
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://${hostHeader}/api/gnani/stt`, { origin: baseUrl });
          ws.on('open', () => reject(new Error('Should reject unauthenticated WS')));
          ws.on('unexpected-response', (_req, res) => {
            expect(res.statusCode).toBe(401);
            resolve();
          });
        }),
      ).resolves.toBeUndefined();

      // Valid signed JWT succeeds on TTS and enforces per-user limit (2/min)
      const validJwt = await new SignJWT({ sub: 'user-jwt-123', role: 'authenticated', is_anonymous: false })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(new TextEncoder().encode(secret));

      const ok1 = await fetch(`${baseUrl}/api/gnani/tts`, {
        method: 'POST',
        headers: { Origin: baseUrl, 'Content-Type': 'application/json', Authorization: `Bearer ${validJwt}` },
        body: JSON.stringify({ text: 'First readback', language: 'en' }),
      });
      expect(ok1.status).toBe(200);

      const ok2 = await fetch(`${baseUrl}/api/gnani/tts`, {
        method: 'POST',
        headers: { Origin: baseUrl, 'Content-Type': 'application/json', Authorization: `Bearer ${validJwt}` },
        body: JSON.stringify({ text: 'Second readback', language: 'en' }),
      });
      expect(ok2.status).toBe(200);

      // 3rd request from same user hits per-user rate limit -> 429
      const limited = await fetch(`${baseUrl}/api/gnani/tts`, {
        method: 'POST',
        headers: { Origin: baseUrl, 'Content-Type': 'application/json', Authorization: `Bearer ${validJwt}` },
        body: JSON.stringify({ text: 'Third readback', language: 'en' }),
      });
      expect(limited.status).toBe(429);

      // Valid JWT on STT WebSocket upgrade opens cleanly
      const sttMsgs = await new Promise<string[]>((resolve, reject) => {
        const msgs: string[] = [];
        const ws = new WebSocket(`ws://${hostHeader}/api/gnani/stt?access_token=${encodeURIComponent(validJwt)}`, { origin: baseUrl });
        ws.on('error', reject);
        ws.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          msgs.push(parsed.type);
          if (parsed.type === 'connected') {
            ws.close();
            resolve(msgs);
          }
        });
      });
      expect(sttMsgs).toEqual(['connected']);
    } finally {
      if (prevRequire === undefined) delete process.env.REQUIRE_AUTH; else process.env.REQUIRE_AUTH = prevRequire;
      if (prevSecret === undefined) delete process.env.SUPABASE_JWT_SECRET; else process.env.SUPABASE_JWT_SECRET = prevSecret;
      if (prevUserLimit === undefined) delete process.env.GNANI_TTS_USER_RATE_LIMIT; else process.env.GNANI_TTS_USER_RATE_LIMIT = prevUserLimit;
      resetRateLimiters();
    }
  });
});
