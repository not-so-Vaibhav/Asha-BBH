import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import WebSocket, { WebSocketServer } from 'ws';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(here, '../dist');
const port = Number(process.env.API_PORT || 4174);
const apiKey = process.env.GNANI_API_KEY_ID?.trim();
const ttsModel = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
const ttsVoice = process.env.GNANI_TTS_VOICE || (ttsModel === 'timbre-v3.0' ? 'Shivani' : 'Kaveri');
const STT_URL = 'wss://api.vachana.ai/stt/v3/stream';
const TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference';
const languageCodes = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req, maxBytes = 16_384) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/gnani/status') {
    json(res, 200, { configured: Boolean(apiKey), sttModel: 'prisma-v3.0', ttsModel, ttsVoice });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/gnani/tts') {
    if (!apiKey) return json(res, 503, { error: 'Gnani API key is not configured. Add GNANI_API_KEY_ID to .env.local and restart the server.' });
    let body;
    try { body = await readJson(req); } catch (error) { return json(res, 400, { error: error.message || 'Invalid JSON request.' }); }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const lang = typeof body.language === 'string' ? body.language : 'en';
    if (!text || text.length > 4_000) return json(res, 400, { error: 'Text must be between 1 and 4000 characters.' });
    if (!Object.hasOwn(languageCodes, lang)) return json(res, 400, { error: 'Unsupported language.' });
    try {
      const upstream = await fetch(TTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-API-Key-ID': apiKey },
        body: JSON.stringify({
          text,
          model: ttsModel,
          voice: ttsVoice,
          language: languageCodes[lang],
          speed: 0.94,
          audio_config: { sample_rate: 48_000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!upstream.ok) {
        const status = upstream.status;
        await upstream.body?.cancel();
        return json(res, status === 401 || status === 403 ? 502 : status, { error: status === 401 || status === 403 ? 'Gnani rejected the key or the account lacks Timbre access. Check the key, credits, and API permissions.' : `Gnani Timbre request failed (${status}).` });
      }
      const audio = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { 'content-type': upstream.headers.get('content-type') || 'audio/wav', 'content-length': audio.length, 'cache-control': 'no-store', 'x-speech-provider': `Gnani Timbre ${ttsModel}` });
      res.end(audio);
    } catch {
      json(res, 502, { error: 'Could not reach Gnani Timbre. Check network access and try again.' });
    }
    return;
  }
  if (url.pathname.startsWith('/api/gnani/')) return json(res, 404, { error: 'Unknown Gnani endpoint.' });
  if (req.method === 'GET' || req.method === 'HEAD') return serveBuiltApp(req, res);
  json(res, 405, { error: 'Method not allowed.' });
});

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname !== '/api/gnani/stt') { socket.destroy(); return; }
  if (!apiKey) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(STT_URL, {
      perMessageDeflate: false,
      handshakeTimeout: 12_000,
      headers: {
        'x-api-key-id': apiKey,
        model: 'prisma-v3.0',
        language_code: 'indic-auto',
        format: 'codemix',
        'x-sample-rate': '16000',
        'x-vad-threshold': '0.5',
        'x-min-silence-ms': '600',
        'x-idle-timeout-sec': '120',
      },
    });
    let upstreamOpen = false;
    let closing = false;
    client.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    });
    upstream.on('open', () => { upstreamOpen = true; });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.on('unexpected-response', (_request, response) => {
      if (client.readyState === WebSocket.OPEN) {
        const message = response.statusCode === 401 || response.statusCode === 403
          ? 'Gnani rejected the key or the account lacks Prisma access. Check the key, credits, and API permissions.'
          : `Gnani Prisma connection failed (${response.statusCode || 'HTTP error'}).`;
        client.send(JSON.stringify({ type: 'error', message }));
        client.close(1011, 'Gnani connection rejected');
      }
    });
    upstream.on('error', () => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'error', message: 'Could not connect to Gnani Prisma. Check the server network and API access.' }));
        client.close(1011, 'Gnani connection failed');
      }
    });
    client.on('close', () => {
      if (closing) return;
      closing = true;
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: 'commit' }));
        const timer = setTimeout(() => upstream.close(1000, 'Client ended session'), 1_200);
        timer.unref?.();
      } else if (upstream.readyState === WebSocket.CONNECTING) upstream.close();
    });
    upstream.on('close', (code, reason) => {
      if (closing) return;
      closing = true;
      if (client.readyState === WebSocket.OPEN) client.close(upstreamOpen ? code : 1011, reason?.toString() || 'Gnani session ended');
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[ASHA SAKHI API] Listening on http://127.0.0.1:${port}; Gnani key ${apiKey ? 'configured' : 'not configured'}.`);
});
