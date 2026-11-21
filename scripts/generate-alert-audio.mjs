import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  console.error('Refusing to call live Gnani Timbre API on CI.');
  process.exit(1);
}

const apiKey = process.env.GNANI_API_KEY_ID?.trim();
if (!apiKey) {
  console.error('GNANI_API_KEY_ID is required in .env.local or environment.');
  process.exit(1);
}

const TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference';
const model = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
const defaultVoice = process.env.GNANI_TTS_VOICE || (model === 'timbre-v3.0' ? 'Shivani' : 'Kaveri');

const alertWording = {
  en: {
    locale: 'en-IN',
    voice: process.env.GNANI_TTS_VOICE_EN?.trim() || defaultVoice,
    text: 'A predefined danger sign was reported. Referral support is recommended.',
  },
  hi: {
    locale: 'hi-IN',
    voice: process.env.GNANI_TTS_VOICE_HI?.trim() || defaultVoice,
    text: 'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
  },
  mr: {
    locale: 'mr-IN',
    voice: process.env.GNANI_TTS_VOICE_MR?.trim() || defaultVoice,
    text: 'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
  },
};

const outDir = path.resolve(process.cwd(), 'public/audio');
fs.mkdirSync(outDir, { recursive: true });

const results = [];
for (const [lang, cfg] of Object.entries(alertWording)) {
  const startedAt = performance.now();
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-Key-ID': apiKey },
    body: JSON.stringify({
      text: cfg.text,
      model,
      voice: cfg.voice,
      language: cfg.locale,
      speed: 1.0,
      audio_config: { sample_rate: 48_000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  if (!res.ok) {
    console.error(`Timbre failed for ${lang}: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    console.error(`Invalid WAV returned for ${lang} (${buf.length} bytes)`);
    process.exit(1);
  }
  const outPath = path.join(outDir, `alert-${lang}.wav`);
  fs.writeFileSync(outPath, buf);
  results.push({ language: lang, locale: cfg.locale, voice: cfg.voice, bytes: buf.length, latencyMs });
  console.log(`Cached ${path.relative(process.cwd(), outPath)} (${buf.length} bytes, ${latencyMs} ms)`);
}

console.log('Done:', JSON.stringify(results));
