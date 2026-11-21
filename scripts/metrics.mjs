import fs from 'node:fs';
import path from 'node:path';
import { evaluateSplit, loadDomainPipeline, percentile } from './eval-core.mjs';

const manifestPath = path.resolve(process.cwd(), 'tests/corpus/manifest.json');
const frozenV2Path = path.resolve(process.cwd(), 'tests/corpus/test_v2_frozen.json');
const fixturesDir = path.resolve(process.cwd(), 'tests/corpus/fixtures');
const fixturesPath = path.join(fixturesDir, 'gnani_transcripts.json');
const vadSweepPath = path.join(fixturesDir, 'vad_sweep.json');
const timbreBenchPath = path.join(fixturesDir, 'timbre_bench.json');
const dangerTimingPath = path.join(fixturesDir, 'danger_timing.json');
const outPath = path.resolve(process.cwd(), 'docs/METRICS.md');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const frozenV2 = fs.existsSync(frozenV2Path) ? JSON.parse(fs.readFileSync(frozenV2Path, 'utf8')) : null;
const fixtures = fs.existsSync(fixturesPath)
  ? JSON.parse(fs.readFileSync(fixturesPath, 'utf8'))
  : { generatedAt: null, target: 'none', audioSources: { humanRecorded: 0, timbreSynthesizedBaseline: 0, missingAudioFiles: manifest.utterances.length }, timbreMeasurements: [], entries: [] };
const vadSweep = fs.existsSync(vadSweepPath) ? JSON.parse(fs.readFileSync(vadSweepPath, 'utf8')) : null;
const timbreBench = fs.existsSync(timbreBenchPath) ? JSON.parse(fs.readFileSync(timbreBenchPath, 'utf8')) : null;
const dangerTiming = fs.existsSync(dangerTimingPath) ? JSON.parse(fs.readFileSync(dangerTimingPath, 'utf8')) : null;

const domain = await loadDomainPipeline();
const testV2Human = evaluateSplit(manifest, fixtures, domain, 'test_v2', { humanOnly: true });
const testV1Eval = evaluateSplit(manifest, fixtures, domain, 'test_v1');
const devEval = evaluateSplit(manifest, fixtures, domain, 'dev');
const allEval = evaluateSplit(manifest, fixtures, domain, null);

const fields = ['beneficiaryId', 'visitType', 'weight', 'vaccinationsDue', 'nextVisitDate'];
const langs = ['en', 'hi', 'mr', 'mix'];

function fmtRate(hits, total) {
  if (!total) return 'N/A (n=0)';
  const flag = total < 30 ? ' ⚠ n<30' : '';
  return `${((hits / total) * 100).toFixed(1)}% (${hits}/${total}${flag})`;
}

function fmtMs(val, n = null) {
  if (typeof val !== 'number') return 'N/A';
  const suffix = typeof n === 'number' ? ` (n=${n}${n < 30 ? ' ⚠ n<30' : ''})` : '';
  return `${val} ms${suffix}`;
}

function sumFields(bucket) {
  let hits = 0;
  let total = 0;
  for (const f of fields) {
    hits += bucket.fieldHits[f];
    total += bucket.fieldTotals[f];
  }
  return { hits, total };
}

function humanStatus(hits, total, targetPct) {
  if (!total) return 'NOT MEASURED';
  const rate = (hits / total) * 100;
  const smallSample = total < 30 ? ' (⚠ denominator < 30)' : '';
  return rate >= targetPct ? `MET on test_v2 human speech${smallSample}` : `NOT MET on test_v2 human speech${smallSample}`;
}

const hasHumanHeadline = testV2Human.evaluatedCount > 0;
const v2Fields = sumFields(testV2Human.overall);
const v1Fields = sumFields(testV1Eval.overall);
const devFields = sumFields(devEval.overall);

const readbackTtsFullP50 = timbreBench?.after?.fullAudioP50Ms ?? percentile((fixtures.timbreMeasurements || []).map((m) => m.latencyMs), 50);
const readbackTtsFullP95 = timbreBench?.after?.fullAudioP95Ms ?? percentile((fixtures.timbreMeasurements || []).map((m) => m.latencyMs), 95);
const eosToReadbackP50 =
  typeof allEval.latency.eosToFinalP50 === 'number' && typeof readbackTtsFullP50 === 'number'
    ? allEval.latency.eosToFinalP50 + readbackTtsFullP50
    : null;
const eosToReadbackP95 =
  typeof allEval.latency.eosToFinalP95 === 'number' && typeof readbackTtsFullP95 === 'number'
    ? allEval.latency.eosToFinalP95 + readbackTtsFullP95
    : null;

function renderLangTable(evalObj) {
  return [
    '| Language | Normal utterances | Beneficiary ID | Visit type | Weight | Vaccinations due | Next visit date |',
    '|---|---|---|---|---|---|---|',
    ...langs.map((l) => {
      const b = evalObj.perLang[l];
      if (!b || !b.normalCount) return `| ${l} | 0 | N/A | N/A | N/A | N/A | N/A |`;
      return `| ${l} | ${b.normalCount} | ${fmtRate(b.fieldHits.beneficiaryId, b.fieldTotals.beneficiaryId)} | ${fmtRate(b.fieldHits.visitType, b.fieldTotals.visitType)} | ${fmtRate(b.fieldHits.weight, b.fieldTotals.weight)} | ${fmtRate(b.fieldHits.vaccinationsDue, b.fieldTotals.vaccinationsDue)} | ${fmtRate(b.fieldHits.nextVisitDate, b.fieldTotals.nextVisitDate)} |`;
    }),
    '',
    '| Language | Correction success | Danger recall | False alerts |',
    '|---|---|---|---|',
    ...langs.map((l) => {
      const b = evalObj.perLang[l];
      if (!b) return `| ${l} | N/A (n=0) | N/A (n=0) | N/A (n=0) |`;
      return `| ${l} | ${fmtRate(b.correctionHits, b.correctionTotal)} | ${fmtRate(b.dangerRecalled, b.dangerExpected)} | ${fmtRate(b.falseAlerts, b.negationTotal)} |`;
    }),
  ];
}

const headlineSection = hasHumanHeadline
  ? [
      '## 1. Headline Metrics — Frozen Held-Out `test_v2` (Human Audio Only)',
      '',
      `Evaluated human \`test_v2\` utterances: **${testV2Human.evaluatedCount}/${testV2Human.totalInSplit}** (frozen SHA-256: \`${frozenV2?.sha256 || 'n/a'}\`).`,
      '',
      '| Metric | Target | Measured (`test_v2` human) | Status |',
      '|---|---|---|---|',
      `| Field extraction accuracy (all 5 fields) | ≥ 95.0% | ${fmtRate(v2Fields.hits, v2Fields.total)} | ${humanStatus(v2Fields.hits, v2Fields.total, 95)} |`,
      `| Voice correction success (single-field isolation) | ≥ 95.0% | ${fmtRate(testV2Human.overall.correctionHits, testV2Human.overall.correctionTotal)} | ${humanStatus(testV2Human.overall.correctionHits, testV2Human.overall.correctionTotal, 95)} |`,
      `| Danger-sign recall (approved + ambiguous recall-first) | 100.0% | ${fmtRate(testV2Human.overall.dangerRecalled, testV2Human.overall.dangerExpected)} | ${humanStatus(testV2Human.overall.dangerRecalled, testV2Human.overall.dangerExpected, 100)} |`,
      `| False alert rate (negations + normal visits) | Low | ${fmtRate(testV2Human.overall.falseAlerts, testV2Human.overall.negationTotal)} | Informational (human speech) |`,
      '',
      '### `test_v2` Human Breakdown by Language',
      '',
      ...renderLangTable(testV2Human),
      '',
      '### `test_v2` Human Breakdown by Noise Level & Speaker',
      '',
      '| Noise level | Evaluated | Field accuracy | Danger recall | False alerts |',
      '|---|---|---|---|---|',
      ...['clean', 'household', 'street'].map((n) => {
        const b = testV2Human.perNoise[n];
        const sf = sumFields(b);
        return `| ${n} | ${b.evaluated} | ${fmtRate(sf.hits, sf.total)} | ${fmtRate(b.dangerRecalled, b.dangerExpected)} | ${fmtRate(b.falseAlerts, b.negationTotal)} |`;
      }),
      '',
      '| Speaker | Evaluated | Field accuracy | Correction success | Danger recall |',
      '|---|---|---|---|---|',
      ...Object.entries(testV2Human.perSpeaker).map(([spk, b]) => {
        const sf = sumFields(b);
        return `| ${spk} | ${b.evaluated} | ${fmtRate(sf.hits, sf.total)} | ${fmtRate(b.correctionHits, b.correctionTotal)} | ${fmtRate(b.dangerRecalled, b.dangerExpected)} |`;
      }),
    ]
  : [
      '## 1. Headline Metrics — Frozen Held-Out `test_v2` (Human Audio Only)',
      '',
      '**No human-speech result yet.**',
      '',
      `- Frozen \`test_v2\` split: **${testV2Human.totalInSplit} unseen utterances** (33 normal visits, 33 danger signs across all 7 rules & all languages, 30 corrections across all 5 fields, 24 negation/near-miss/ambiguous cases).`,
      `- Frozen ID list & SHA-256: \`tests/corpus/test_v2_frozen.json\` (\`${frozenV2?.sha256 || 'n/a'}\`).`,
      '- Recording plan: at least **2 human speakers** (one female if possible), **50% clean (60)** + **25% household (30)** + **25% street (30)** placed in `tests/corpus/audio/` per `tests/corpus/SCRIPT.md`, then run `npm run gnani:eval -- --split test_v2 && npm run metrics`.',
      '- Previous synthetic Phase 2B `test` items are now marked **`test_v1` (seen regression set)** in Section 6 below and are **never** reported as headline metrics.',
    ];

const md = [
  '# ASHA SAKHI — Measured Gnani Voice Pipeline Metrics',
  '',
  `Generated: ${new Date().toISOString()}  `,
  `Fixture run timestamp: ${fixtures.generatedAt || 'Not yet run'}  `,
  `Target endpoint: \`${fixtures.target || 'none'}\`  `,
  `Corpus splits: **40 \`dev\` (seen tuning)** · **40 \`test_v1\` (seen regression)** · **120 \`test_v2\` (frozen unseen human held-out)**`,
  '',
  '> **Measurement integrity notice:** Headline numbers in Section 1 come **exclusively from human-recorded audio on the frozen held-out `test_v2` split**. All `dev` and `test_v1` numbers below are **seen synthetic baseline regression data (not human speech)** and never claim an unqualified `MET`. Every denominator under 30 is flagged `⚠ n<30`.',
  '',
  '---',
  '',
  ...headlineSection,
  '',
  '---',
  '',
  '## 2. User-Experienced Latency (End of Speech → User Event, Seen Synthetic Baseline)',
  '',
  'End-of-speech (`EoS`) is measured from the last active 32 ms speech frame (RMS > 0.008) in each PCM stream, excluding the speaker’s talking duration. Legacy `first-frame → final` includes full speaking duration.',
  '',
  '| Latency stage | Samples | p50 | p95 | Notes |',
  '|---|---|---|---|---|',
  `| **End of speech → final transcript** (Prisma STT) | ${allEval.latency.eosSamples}${allEval.latency.eosSamples < 30 ? ' ⚠ n<30' : ''} | ${fmtMs(allEval.latency.eosToFinalP50)} | ${fmtMs(allEval.latency.eosToFinalP95)} | Includes VAD \`x-min-silence-ms=600\` + inference + WS RTT |`,
  `| **End of speech → danger alert visible** | ${allEval.latency.eosDangerSamples}${allEval.latency.eosDangerSamples < 30 ? ' ⚠ n<30' : ''} | ${fmtMs(allEval.latency.eosToDangerAlertVisibleP50)} | ${fmtMs(allEval.latency.eosToDangerAlertVisibleP95)} | Fires on first finalized danger segment (<1 ms rule check) |`,
  `| **End of speech → alert audio start** (pre-cached WAV) | ${allEval.latency.eosAlertAudioSamples}${allEval.latency.eosAlertAudioSamples < 30 ? ' ⚠ n<30' : ''} | ${fmtMs(allEval.latency.eosToAlertAudioStartP50)} | ${fmtMs(allEval.latency.eosToAlertAudioStartP95)} | 0 ms network fetch via preloaded \`public/audio/alert-{lang}.wav\` |`,
  `| **End of speech → read-back audio start** (uncached Timbre) | ${allEval.latency.eosSamples}${allEval.latency.eosSamples < 30 ? ' ⚠ n<30' : ''} | ${fmtMs(eosToReadbackP50)} | ${fmtMs(eosToReadbackP95)} | EoS→transcript + concise Timbre REST WAV; 0 ms on cached/pre-gen |`,
  `| *Legacy: first audio frame → final transcript (includes speaking time)* | ${allEval.latency.firstFrameSamples}${allEval.latency.firstFrameSamples < 30 ? ' ⚠ n<30' : ''} | ${fmtMs(allEval.latency.firstFrameToFinalP50)} | ${fmtMs(allEval.latency.firstFrameToFinalP95)} | Includes full utterance duration (3–10 s of speech) |`,
  '',
  '---',
  '',
  '## 3. VAD `x-min-silence-ms` Sweep (`dev` Split Only)',
  '',
  ...(vadSweep
    ? [
        '| `x-min-silence-ms` | Samples (`dev`) | EoS → final p50 | EoS → final p95 | Field accuracy | Danger recall | False alerts |',
        '|---|---|---|---|---|---|---|',
        ...vadSweep.results.map(
          (r) =>
            `| ${r.minSilenceMs} ms | ${r.samples} ⚠ n<30 | ${fmtMs(r.eosToFinalP50Ms)} | ${fmtMs(r.eosToFinalP95Ms)} | ${fmtRate(r.fieldHits, r.fieldTotals)} | ${fmtRate(r.dangerRecalled, r.dangerExpected)} | ${r.falseAlerts} |`,
        ),
      ]
    : ['Not yet run.']),
  '',
  '---',
  '',
  '## 4. Danger-Path Early-Fire Proof (Long Multi-Segment Utterance)',
  '',
  ...(dangerTiming
    ? [
        `- Segment 1 (danger phrase) speech duration: **${dangerTiming.seg1SpeechDurationMs} ms**`,
        `- Combined multi-segment audio duration: **${dangerTiming.totalCombinedAudioMs} ms**`,
        `- End of Segment 1 → danger alert visible: **${fmtMs(dangerTiming.eosSeg1ToDangerAlertVisibleMs)}**`,
        `- Alert fired before combined audio ended: **${dangerTiming.alertFiredBeforeCombinedAudioEnded ? 'YES' : 'NO'}**`,
        `- Lead time before Segment 2 finalized: **${fmtMs(dangerTiming.alertFiredBeforeSecondSegmentMs)}**`,
        `- Waited for read-back or live TTS call: **${dangerTiming.waitedForTts ? 'YES' : 'NO (pre-cached alert WAV)'}**`,
      ]
    : ['Not yet run.']),
  '',
  '---',
  '',
  '## 5. Timbre Read-Back Speed Breakdown',
  '',
  ...(timbreBench
    ? [
        '| Read-back variant | Samples | Avg chars | Request → first byte p50 | Full audio p50 | Full audio p95 |',
        '|---|---|---|---|---|---|',
        `| Before (verbose wording, REST) | ${timbreBench.before.samples} ⚠ n<30 | ${timbreBench.before.avgChars} | ${fmtMs(timbreBench.before.firstByteP50Ms)} | ${fmtMs(timbreBench.before.fullAudioP50Ms)} | ${fmtMs(timbreBench.before.fullAudioP95Ms)} |`,
        `| After (concise wording, REST) | ${timbreBench.after.samples} ⚠ n<30 | ${timbreBench.after.avgChars} | ${fmtMs(timbreBench.after.firstByteP50Ms)} | ${fmtMs(timbreBench.after.fullAudioP50Ms)} | ${fmtMs(timbreBench.after.fullAudioP95Ms)} |`,
        `| Pre-generated template / cached replay | — | ${timbreBench.after.avgChars} | 0 ms (0 Timbre calls) | 0 ms | 0 ms |`,
      ]
    : ['Not yet run.']),
  '',
  '---',
  '',
  '## 6. Seen Regression Sets (`dev` + `test_v1` — Synthetic Baseline, NOT Headline Metrics)',
  '',
  'Both `dev` and `test_v1` have been seen and are used strictly for regression testing of general failure-class fixes.',
  '',
  '| Metric | `dev` (seen tuning, n=' + devEval.evaluatedCount + ') | `test_v1` (seen regression, n=' + testV1Eval.evaluatedCount + ') |',
  '|---|---|---|',
  `| Field extraction accuracy (all 5 fields) | ${fmtRate(devFields.hits, devFields.total)} | ${fmtRate(v1Fields.hits, v1Fields.total)} |`,
  `| Voice correction success | ${fmtRate(devEval.overall.correctionHits, devEval.overall.correctionTotal)} | ${fmtRate(testV1Eval.overall.correctionHits, testV1Eval.overall.correctionTotal)} |`,
  `| Danger-sign recall (approved + ambiguous) | ${fmtRate(devEval.overall.dangerRecalled, devEval.overall.dangerExpected)} | ${fmtRate(testV1Eval.overall.dangerRecalled, testV1Eval.overall.dangerExpected)} |`,
  `| False alert rate (negations + normal) | ${fmtRate(devEval.overall.falseAlerts, devEval.overall.negationTotal)} | ${fmtRate(testV1Eval.overall.falseAlerts, testV1Eval.overall.negationTotal)} |`,
  '',
  '### `test_v1` (Seen Regression) Breakdown by Language',
  '',
  ...renderLangTable(testV1Eval),
  '',
  '### `dev` (Seen Tuning) Breakdown by Language',
  '',
  ...renderLangTable(devEval),
  '',
  '---',
  '',
  '## 7. Remaining Regression Failures (`dev` + `test_v1`, Seen Synthetic Data)',
  '',
  ...(allEval.failures.length === 0
    ? ['None on evaluated regression fixtures.']
    : [
        '| Split | ID | Category | Lang | Noise | Field | Expected | Got | Cause | Transcript |',
        '|---|---|---|---|---|---|---|---|---|---|',
        ...allEval.failures.map(
          (f) => `| ${f.split} | ${f.id} | ${f.category} | ${f.language} | ${f.noiseLevel} | ${f.field} | ${f.expected} | ${f.got} | ${f.cause} | ${f.transcript} |`,
        ),
      ]),
  '',
];

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md.join('\n'));
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (test_v2 human=${testV2Human.evaluatedCount}/120, test_v1 seen=${testV1Eval.evaluatedCount}/40, dev seen=${devEval.evaluatedCount}/40).`);
