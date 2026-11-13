export default function status(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });
  const ttsModel = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
  const ttsVoice = process.env.GNANI_TTS_VOICE || (ttsModel === 'timbre-v3.0' ? 'Shivani' : 'Kaveri');
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({
    configured: Boolean(process.env.GNANI_API_KEY_ID?.trim()),
    sttModel: 'prisma-v3.0',
    ttsModel,
    ttsVoice,
  });
}
