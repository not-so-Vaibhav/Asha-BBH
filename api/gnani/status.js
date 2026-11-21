import { corsHeaders, getSameOrigin, securityHeaders } from '../../server/security.mjs';

export default function status(request, response) {
  const sameOrigin = getSameOrigin(request);
  const headers = securityHeaders({
    Allow: 'GET, OPTIONS',
    ...corsHeaders(sameOrigin, 'GET, OPTIONS'),
  });
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  if (request.method === 'OPTIONS') {
    return sameOrigin ? response.status(204).end() : response.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  }
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });
  const ttsModel = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
  const ttsVoice = process.env.GNANI_TTS_VOICE || (ttsModel === 'timbre-v3.0' ? 'Shivani' : 'Kaveri');
  return response.status(200).json({
    configured: Boolean(process.env.GNANI_API_KEY_ID?.trim()),
    sttModel: 'prisma-v3.0',
    ttsModel,
    ttsVoice,
  });
}
