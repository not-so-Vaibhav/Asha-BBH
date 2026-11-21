import { describe, it, expect } from 'vitest';
import { createTimbreQueue } from './timbreQueue.mjs';
import { createTtsHandler } from '../api/gnani/tts.js';
import { resetRateLimiters } from './security.mjs';

function wavResponse(tag = 'OK') {
  return new Response(Buffer.from(`RIFF....WAVEfmt ${tag}`), {
    status: 200,
    headers: { 'content-type': 'audio/wav' },
  });
}

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

describe('server-side Timbre queue (concurrency 1 + 429 backoff retry + cache)', () => {
  it('enforces strict concurrency 1 across simultaneous requests', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];

    const mockFetch = async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${payload.text}`);
      await new Promise((r) => setTimeout(r, 25));
      order.push(`end:${payload.text}`);
      active -= 1;
      return wavResponse(payload.text);
    };

    const queue = createTimbreQueue({
      fetchImpl: mockFetch as typeof fetch,
      maxCacheEntries: 0,
      backoffBaseMs: 5,
    });

    const [r1, r2, r3] = await Promise.all([
      queue.synthesize({ apiKey: 'k', text: 'one', language: 'en', locale: 'en-IN', model: 'timbre-v3.0', voice: 'Shivani', speed: 0.95 }),
      queue.synthesize({ apiKey: 'k', text: 'two', language: 'en', locale: 'en-IN', model: 'timbre-v3.0', voice: 'Shivani', speed: 0.95 }),
      queue.synthesize({ apiKey: 'k', text: 'three', language: 'en', locale: 'en-IN', model: 'timbre-v3.0', voice: 'Shivani', speed: 0.95 }),
    ]);

    expect(maxActive).toBe(1);
    expect(order).toEqual(['start:one', 'end:one', 'start:two', 'end:two', 'start:three', 'end:three']);
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    expect(r3.queueWaitMs).toBeGreaterThanOrEqual(20);
  });

  it('retries upstream 429 with exponential backoff and succeeds when upstream recovers', async () => {
    let calls = 0;
    const delays: number[] = [];
    const mockFetch = async () => {
      calls += 1;
      if (calls <= 2) {
        return new Response('rate limited', { status: 429 });
      }
      return wavResponse('recovered');
    };

    const queue = createTimbreQueue({
      fetchImpl: mockFetch as typeof fetch,
      maxRetries: 2,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      randomImpl: () => 0,
      sleepImpl: async (ms: number) => { delays.push(ms); },
    });

    const res = await queue.synthesize({
      apiKey: 'k',
      text: 'retry me',
      language: 'hi',
      locale: 'hi-IN',
      model: 'timbre-v3.0',
      voice: 'Shivani',
      speed: 0.95,
    });

    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(3);
    expect(res.retriesAttempted).toBe(2);
    expect(delays).toEqual([100, 200]);
  });

  it('returns explicit UPSTREAM_429_EXHAUSTED error with retry metadata when all retries fail', async () => {
    let calls = 0;
    const delays: number[] = [];
    const mockFetch = async () => {
      calls += 1;
      return new Response('still busy', { status: 429, headers: { 'retry-after': '1' } });
    };

    const queue = createTimbreQueue({
      fetchImpl: mockFetch as typeof fetch,
      maxRetries: 2,
      backoffBaseMs: 100,
      backoffMaxMs: 2_000,
      sleepImpl: async (ms: number) => { delays.push(ms); },
    });

    const res = await queue.synthesize({
      apiKey: 'k',
      text: 'always 429',
      language: 'mr',
      locale: 'mr-IN',
      model: 'timbre-v3.0',
      voice: 'Shivani',
      speed: 0.95,
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.errorCode).toBe('UPSTREAM_429_EXHAUSTED');
    expect(res.retriesAttempted).toBe(2);
    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 1000]);
  });

  it('serves repeated phrases from server-side LRU cache without extra upstream calls', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls += 1;
      return wavResponse('cached');
    };
    const queue = createTimbreQueue({ fetchImpl: mockFetch as typeof fetch });
    const req = { apiKey: 'k', text: 'repeat phrase', language: 'en', locale: 'en-IN', model: 'timbre-v3.0', voice: 'Shivani', speed: 0.95 };

    const first = await queue.synthesize(req);
    const second = await queue.synthesize(req);

    expect(first.ok && second.ok).toBe(true);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(calls).toBe(1);
  });

  it('exposes structured 429 fallback headers & JSON payload through the Vercel TTS handler', async () => {
    resetRateLimiters();
    const prevKey = process.env.GNANI_API_KEY_ID;
    process.env.GNANI_API_KEY_ID = 'test-key';
    try {
      const queue = createTimbreQueue({
        fetchImpl: (async () => new Response('busy', { status: 429 })) as typeof fetch,
        maxRetries: 1,
        backoffBaseMs: 5,
        sleepImpl: async () => {},
      });
      const handler = createTtsHandler(queue);
      const res = mockVercelRes();
      await handler(
        {
          method: 'POST',
          headers: {
            host: 'app.example',
            origin: 'https://app.example',
            'content-type': 'application/json',
            'x-forwarded-for': '10.0.0.9',
          },
          body: { text: 'Test busy', language: 'en' },
        },
        res,
      );
      expect(res.result.statusCode).toBe(429);
      expect(res.result.headers['x-speech-error-code']).toBe('UPSTREAM_429_EXHAUSTED');
      expect(res.result.headers['x-speech-retries']).toBe('1');
      expect(res.result.body).toMatchObject({ code: 'UPSTREAM_429_EXHAUSTED', retriesAttempted: 1 });
    } finally {
      if (prevKey === undefined) delete process.env.GNANI_API_KEY_ID;
      else process.env.GNANI_API_KEY_ID = prevKey;
    }
  });
});
