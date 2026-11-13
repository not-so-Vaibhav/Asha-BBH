import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

const STT_URL = 'wss://api.vachana.ai/stt/v3/stream';
const server = http.createServer((_request, response) => {
  response.writeHead(426, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Prisma streaming requires a WebSocket connection.' }));
});
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 64 * 1024 });

wss.on('connection', (client, request) => {
  const origin = request.headers.origin;
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && host && new URL(origin).host === host); } catch { /* reject malformed origins */ }
  if (!sameOrigin) {
    client.close(1008, 'Requests must come from this ASHA SAKHI deployment');
    return;
  }
  const apiKey = process.env.GNANI_API_KEY_ID?.trim();
  if (!apiKey) {
    client.send(JSON.stringify({ type: 'error', message: 'Gnani speech is not configured on this deployment.' }));
    client.close(1011, 'Gnani not configured');
    return;
  }

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
    if (client.readyState !== WebSocket.OPEN) return;
    const message = response.statusCode === 401 || response.statusCode === 403
      ? 'Gnani rejected the key or this account lacks Prisma access. Check deployment environment variables, credits, and API permissions.'
      : `Gnani Prisma connection failed (${response.statusCode || 'HTTP error'}).`;
    client.send(JSON.stringify({ type: 'error', message }));
    client.close(1011, 'Gnani connection rejected');
  });
  upstream.on('error', () => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'error', message: 'Could not connect to Gnani Prisma. Check deployment network and API access.' }));
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

export default server;
