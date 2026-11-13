const TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference';
const languageCodes = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

function sendError(response, status, message) {
  return response.status(status).json({ error: message });
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export default async function tts(request, response) {
  if (request.method !== 'POST') return sendError(response, 405, 'Method not allowed.');
  if (!isSameOrigin(request)) return sendError(response, 403, 'Requests must come from this ASHA SAKHI deployment.');
  const apiKey = process.env.GNANI_API_KEY_ID?.trim();
  if (!apiKey) return sendError(response, 503, 'Gnani speech is not configured on this deployment.');

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const language = typeof body.language === 'string' ? body.language : 'en';
  if (!text || text.length > 4_000) return sendError(response, 400, 'Text must be between 1 and 4000 characters.');
  if (!Object.hasOwn(languageCodes, language)) return sendError(response, 400, 'Unsupported language.');

  const model = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
  const voice = process.env.GNANI_TTS_VOICE || (model === 'timbre-v3.0' ? 'Shivani' : 'Kaveri');
  try {
    const upstream = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Key-ID': apiKey },
      body: JSON.stringify({
        text,
        model,
        voice,
        language: languageCodes[language],
        speed: 0.94,
        audio_config: { sample_rate: 48_000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      const status = upstream.status;
      await upstream.body?.cancel();
      return sendError(response, status === 401 || status === 403 ? 502 : status,
        status === 401 || status === 403
          ? 'Gnani rejected the key or this account lacks Timbre access. Check deployment environment variables, credits, and API permissions.'
          : `Gnani Timbre request failed (${status}).`);
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/wav');
    response.setHeader('Content-Length', String(audio.length));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Speech-Provider', `Gnani Timbre ${model}`);
    return response.status(200).send(audio);
  } catch {
    return sendError(response, 502, 'Could not reach Gnani Timbre. Check the deployment network and try again.');
  }
}
