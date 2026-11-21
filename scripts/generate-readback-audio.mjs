import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createTimbreQueue } from '../server/timbreQueue.mjs';
import { ALLOWED_LANGUAGES, resolveTtsVoice } from '../server/security.mjs';

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

const force = process.argv.includes('--force');
const model = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
const sampleRate = 24_000; // Officially supported by Gnani Timbre audio_config; halves static asset weight vs 48 kHz
const speed = 0.95;

const beneficiaries = {
  'BEN-1001': 'Sunita Patil',
  'BEN-1002': 'Baby of Anita',
  'BEN-1003': 'Rekha Jadhav',
  'BEN-1004': 'Meena Pawar',
  'BEN-1005': 'Aarav Kulkarni',
};

const localizedCopy = {
  en: { notCaptured: 'Not captured', noneReported: 'None reported', notSet: 'Not set', anc: 'ANC', pnc: 'PNC', hbnc: 'HBNC', hbyc: 'HBYC', immunisation: 'Immunisation', general: 'General' },
  hi: { notCaptured: 'दर्ज नहीं', noneReported: 'कुछ नहीं बताया', notSet: 'तय नहीं', anc: 'ANC', pnc: 'PNC', hbnc: 'HBNC', hbyc: 'HBYC', immunisation: 'टीकाकरण', general: 'सामान्य' },
  mr: { notCaptured: 'नोंदलेले नाही', noneReported: 'काही सांगितले नाही', notSet: 'निश्चित नाही', anc: 'ANC', pnc: 'PNC', hbnc: 'HBNC', hbyc: 'HBYC', immunisation: 'लसीकरण', general: 'सामान्य' },
};

function formattedDate(value, language) {
  if (!value || value === 'Not set') return value;
  const d = new Date(value + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
  });
}

function displayValue(value, language) {
  if (value === 'Not captured') return localizedCopy[language].notCaptured;
  if (value === 'None reported') return localizedCopy[language].noneReported;
  if (value === 'Not set') return localizedCopy[language].notSet;
  return value;
}

function recordText(beneficiaryId, fields, language) {
  const name = beneficiaries[beneficiaryId];
  const visitType = localizedCopy[language][fields.visitType.toLowerCase()];
  const weight = displayValue(fields.weight, language);
  const vax = displayValue(fields.vaccinationsDue, language);
  const nextDate = displayValue(formattedDate(fields.nextVisitDate, language), language);
  if (language === 'hi') {
    return `${name}, ${beneficiaryId}। ${visitType}, ${weight}। टीके: ${vax}। अगली भेट: ${nextDate}।`;
  }
  if (language === 'mr') {
    return `${name}, ${beneficiaryId}. ${visitType}, ${weight}. लसी: ${vax}. पुढील भेट: ${nextDate}.`;
  }
  return `${name}, ${beneficiaryId}. ${visitType}, ${weight}. Vaccines: ${vax}. Next: ${nextDate}.`;
}

// Mirrors PREGEN_READBACK_TEMPLATES in src/voice/readback.ts
const templates = [
  { id: 'anc-55-20nov', beneficiaryId: 'BEN-1001', fields: { visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' } },
  { id: 'anc-56-20nov', beneficiaryId: 'BEN-1001', fields: { visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' } },
  { id: 'anc-56-22nov', beneficiaryId: 'BEN-1001', fields: { visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' } },
  { id: 'anc-55-22nov', beneficiaryId: 'BEN-1001', fields: { visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' } },
  { id: 'gen-sunita-empty', beneficiaryId: 'BEN-1001', fields: { visitType: 'General', weight: 'Not captured', vaccinationsDue: 'None reported', nextVisitDate: 'Not set' } },
  { id: 'hbnc-3-2-18nov', beneficiaryId: 'BEN-1002', fields: { visitType: 'HBNC', weight: '3.2 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-18' } },
  { id: 'gen-baby-empty', beneficiaryId: 'BEN-1002', fields: { visitType: 'General', weight: 'Not captured', vaccinationsDue: 'None reported', nextVisitDate: 'Not set' } },
  { id: 'hbyc-9-25nov', beneficiaryId: 'BEN-1003', fields: { visitType: 'HBYC', weight: '9 kg', vaccinationsDue: 'OPV', nextVisitDate: '2026-11-25' } },
  { id: 'pnc-52-22nov', beneficiaryId: 'BEN-1004', fields: { visitType: 'PNC', weight: '52 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' } },
  { id: 'imm-12-28nov', beneficiaryId: 'BEN-1005', fields: { visitType: 'Immunisation', weight: '12 kg', vaccinationsDue: 'DPT', nextVisitDate: '2026-11-28' } },
];

const outDir = path.resolve(process.cwd(), 'public/audio/readback');
fs.mkdirSync(outDir, { recursive: true });

const queue = createTimbreQueue({ maxRetries: 6, backoffBaseMs: 5_000, backoffMaxMs: 30_000, maxCacheEntries: 0 });
const languages = ['en', 'hi', 'mr'];
const manifest = [];
let generated = 0;
let skipped = 0;
let totalBytes = 0;
const paceMs = 1_500;

for (const tpl of templates) {
  for (const lang of languages) {
    const fileName = `${tpl.id}-${lang}.wav`;
    const outPath = path.join(outDir, fileName);
    const text = recordText(tpl.beneficiaryId, tpl.fields, lang);
    const voice = resolveTtsVoice(lang, model);

    if (!force && fs.existsSync(outPath) && fs.statSync(outPath).size > 44) {
      const bytes = fs.statSync(outPath).size;
      totalBytes += bytes;
      skipped += 1;
      manifest.push({ id: tpl.id, language: lang, file: `/audio/readback/${fileName}`, bytes, voice, sampleRate, cached: true });
      continue;
    }

    if (generated > 0) {
      await new Promise((r) => setTimeout(r, paceMs));
    }

    const res = await queue.synthesize({
      apiKey,
      text,
      language: lang,
      locale: ALLOWED_LANGUAGES[lang],
      model,
      voice,
      speed,
      sampleRate,
    });

    if (!res.ok) {
      console.error(`Timbre failed for ${fileName}: status=${res.status} code=${res.errorCode} attempts=${res.attempts}`);
      process.exit(1);
    }

    if (res.audio.length < 44 || res.audio.toString('ascii', 0, 4) !== 'RIFF') {
      console.error(`Invalid WAV returned for ${fileName} (${res.audio.length} bytes)`);
      process.exit(1);
    }

    fs.writeFileSync(outPath, res.audio);
    generated += 1;
    totalBytes += res.audio.length;
    manifest.push({
      id: tpl.id,
      language: lang,
      file: `/audio/readback/${fileName}`,
      bytes: res.audio.length,
      voice,
      sampleRate,
      latencyMs: res.latencyMs,
      attempts: res.attempts,
    });
    console.log(`Generated ${fileName} (${res.audio.length} B, ${res.latencyMs} ms, attempts=${res.attempts})`);
  }
}

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    model,
    sampleRate,
    speed,
    count: manifest.length,
    totalBytes,
    entries: manifest,
  }, null, 2),
);

console.log(`Done: ${generated} generated, ${skipped} existing, ${manifest.length} total (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
