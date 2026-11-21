import esbuild from 'esbuild';

let cachedDomain = null;

/**
 * Loads the real TypeScript domain modules using esbuild (already installed via Vite)
 * so evaluation and metrics execute the exact production code.
 */
export async function loadDomainPipeline() {
  if (cachedDomain) return cachedDomain;
  const entry = `
    export { extract, extractDetailed } from './src/domain/extraction.ts';
    export { correctField } from './src/domain/correction.ts';
    export { scanDangerSigns } from './src/domain/rules.ts';
    export { normalizeTranscript } from './src/domain/normalize.ts';
    export { canonicalizeVaccinationField } from './src/domain/vaccines.ts';
  `;
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  cachedDomain = await import(dataUrl);
  return cachedDomain;
}

export function percentile(values, p) {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

const FIELD_NAMES = ['beneficiaryId', 'visitType', 'weight', 'vaccinationsDue', 'nextVisitDate'];

function makeBucket() {
  return {
    evaluated: 0,
    normalCount: 0,
    fieldHits: Object.fromEntries(FIELD_NAMES.map((f) => [f, 0])),
    fieldTotals: Object.fromEntries(FIELD_NAMES.map((f) => [f, 0])),
    correctionTotal: 0,
    correctionHits: 0,
    dangerExpected: 0,
    dangerRecalled: 0,
    negationTotal: 0,
    falseAlerts: 0,
  };
}

function fieldMatches(field, gotVal, expectedVal, domain) {
  if (field === 'vaccinationsDue' && domain.canonicalizeVaccinationField) {
    return (
      domain.canonicalizeVaccinationField(String(gotVal)).toLowerCase() ===
      domain.canonicalizeVaccinationField(String(expectedVal)).toLowerCase()
    );
  }
  return String(gotVal).toLowerCase() === String(expectedVal).toLowerCase();
}

function classifyFailureCause(field, expected, got, transcript, audioSource) {
  if (!transcript || !transcript.trim()) return 'Empty STT transcript / connection error';
  const low = transcript.toLowerCase();
  const expLow = String(expected).toLowerCase();
  if (field === 'visitType' && !low.includes(expLow)) {
    return `STT did not transcribe "${expected}" verbatim (${audioSource})`;
  }
  if (field === 'nextVisitDate' && got === 'Not set') {
    return 'Date phrase not recognized in transcript';
  }
  if (field === 'weight' && got === 'Not captured') {
    return 'Weight phrase not recognized in transcript';
  }
  if (field === 'beneficiaryId') {
    return `Beneficiary ID variant not normalized to ${expected}`;
  }
  return `Mismatch between STT transcript and expected ${field}`;
}

export function evaluateSplit(manifest, fixtures, domain, splitFilter = null, { humanOnly = false } = {}) {
  const refDate = manifest.referenceDate || '2026-11-13';
  const fixtureMap = new Map((fixtures.entries || []).map((e) => [e.id, e]));

  const overall = makeBucket();
  const perLang = {};
  const perNoise = {
    clean: makeBucket(),
    household: makeBucket(),
    street: makeBucket(),
  };
  const perSpeaker = {};

  const ensureMap = (obj, key) => {
    if (!obj[key]) obj[key] = makeBucket();
    return obj[key];
  };

  const failures = [];
  const firstFrameToFinal = [];
  const eosToFinal = [];
  const eosToDangerAlertVisible = [];
  const eosToAlertAudioStart = [];
  const audioSources = { human: 0, synthetic: 0 };

  const targetItems = manifest.utterances.filter((u) => !splitFilter || u.split === splitFilter);

  for (const item of targetItems) {
    const fx = fixtureMap.get(item.id);
    if (!fx || typeof fx.transcript !== 'string') continue;

    const isHuman = fx.audioSource === 'human-recorded';
    if (humanOnly && !isHuman) continue;

    if (isHuman) audioSources.human += 1;
    else audioSources.synthetic += 1;

    const noise = fx.noiseLevel || (isHuman ? item.noiseLevel : 'clean');
    const speaker = fx.speaker || item.speaker || 'unknown';
    const langBucket = ensureMap(perLang, item.language);
    const noiseBucket = ensureMap(perNoise, noise);
    const speakerBucket = ensureMap(perSpeaker, speaker);
    const buckets = [overall, langBucket, noiseBucket, speakerBucket];
    for (const b of buckets) b.evaluated += 1;

    if (typeof fx.timeToFinalMs === 'number') firstFrameToFinal.push(fx.timeToFinalMs);
    if (typeof fx.eosToFinalTranscriptMs === 'number') eosToFinal.push(fx.eosToFinalTranscriptMs);
    if (typeof fx.eosToDangerAlertVisibleMs === 'number') eosToDangerAlertVisible.push(fx.eosToDangerAlertVisibleMs);
    if (typeof fx.eosToAlertAudioStartMs === 'number') eosToAlertAudioStart.push(fx.eosToAlertAudioStartMs);

    if (item.category === 'normal' && item.expectedFields) {
      for (const b of buckets) b.normalCount += 1;
      const detailed = domain.extractDetailed(fx.transcript, item.beneficiaryId, refDate, item.beneficiaryKind);
      const got = detailed.fields;
      for (const f of FIELD_NAMES) {
        const ok = fieldMatches(f, got[f], item.expectedFields[f], domain);
        for (const b of buckets) {
          b.fieldTotals[f] += 1;
          if (ok) b.fieldHits[f] += 1;
        }
        if (!ok) {
          failures.push({
            id: item.id,
            split: item.split,
            category: 'extraction',
            language: item.language,
            noiseLevel: noise,
            speaker,
            field: f,
            expected: item.expectedFields[f],
            got: got[f],
            transcript: fx.transcript,
            cause: classifyFailureCause(f, item.expectedFields[f], got[f], fx.transcript, fx.audioSource),
          });
        }
      }

      const alerts = domain.scanDangerSigns(fx.transcript, item.beneficiaryKind, item.language === 'mix' ? 'en' : item.language, true);
      for (const b of buckets) {
        b.negationTotal += 1;
        if (alerts.length > 0) b.falseAlerts += 1;
      }
      if (alerts.length > 0) {
        failures.push({
          id: item.id,
          split: item.split,
          category: 'false-alert',
          language: item.language,
          noiseLevel: noise,
          speaker,
          field: 'dangerRules',
          expected: 'none',
          got: alerts.map((a) => a.rule.id).join(', '),
          transcript: fx.transcript,
          cause: 'Danger rule triggered on normal visit transcript',
        });
      }
    }

    if (item.category === 'danger') {
      const matches = domain.scanDangerSigns(fx.transcript, item.beneficiaryKind, item.language === 'mix' ? 'en' : item.language, true);
      const firedIds = matches.map((m) => m.rule.id);
      for (const expectedRule of item.expectedDangerRuleIds) {
        const hit = firedIds.includes(expectedRule);
        for (const b of buckets) {
          b.dangerExpected += 1;
          if (hit) b.dangerRecalled += 1;
        }
        if (!hit) {
          failures.push({
            id: item.id,
            split: item.split,
            category: 'danger-miss',
            language: item.language,
            noiseLevel: noise,
            speaker,
            field: 'dangerRules',
            expected: expectedRule,
            got: firedIds.join(', ') || 'none',
            transcript: fx.transcript,
            cause: `Danger rule ${expectedRule} missed on STT transcript`,
          });
        }
      }
    }

    if (item.category === 'negation') {
      const matches = domain.scanDangerSigns(fx.transcript, item.beneficiaryKind, item.language === 'mix' ? 'en' : item.language, true);
      const firedIds = matches.map((m) => m.rule.id);
      if (item.expectedDangerRuleIds.length > 0) {
        for (const expectedRule of item.expectedDangerRuleIds) {
          const match = matches.find((m) => m.rule.id === expectedRule);
          const hit = Boolean(match && (!item.expectedNeedsReview || match.needsReview));
          for (const b of buckets) {
            b.dangerExpected += 1;
            if (hit) b.dangerRecalled += 1;
          }
          if (!hit) {
            failures.push({
              id: item.id,
              split: item.split,
              category: 'danger-miss',
              language: item.language,
              noiseLevel: noise,
              speaker,
              field: 'dangerRules',
              expected: `${expectedRule} (needsReview=${item.expectedNeedsReview})`,
              got: match ? `${match.rule.id} (needsReview=${match.needsReview})` : 'none',
              transcript: fx.transcript,
              cause: 'Recall-first ambiguous wording not flagged with needsReview',
            });
          }
        }
      } else {
        for (const b of buckets) {
          b.negationTotal += 1;
          if (firedIds.length > 0) b.falseAlerts += 1;
        }
        if (firedIds.length > 0) {
          failures.push({
            id: item.id,
            split: item.split,
            category: 'false-alert',
            language: item.language,
            noiseLevel: noise,
            speaker,
            field: 'dangerRules',
            expected: 'none',
            got: firedIds.join(', '),
            transcript: fx.transcript,
            cause: 'Negation / resolved near-miss not suppressed',
          });
        }
      }
    }

    if (item.category === 'correction' && item.expectedCorrection) {
      const res = domain.correctField(fx.transcript, item.baseFields, new Date(`${refDate}T12:00:00Z`));
      const onlyFieldChanged = Boolean(
        res &&
          Object.keys(item.baseFields).every((k) =>
            k === item.expectedCorrection.field
              ? fieldMatches(k, res.fields[k], item.expectedCorrection.newValue, domain)
              : res.fields[k] === item.baseFields[k],
          ),
      );
      const hit = Boolean(res && res.correction.field === item.expectedCorrection.field && onlyFieldChanged);
      for (const b of buckets) {
        b.correctionTotal += 1;
        if (hit) b.correctionHits += 1;
      }
      if (!hit) {
        failures.push({
          id: item.id,
          split: item.split,
          category: 'correction',
          language: item.language,
          noiseLevel: noise,
          speaker,
          field: item.expectedCorrection.field,
          expected: item.expectedCorrection.newValue,
          got: res ? `${res.correction.field}=${res.correction.newValue}` : 'null',
          transcript: fx.transcript,
          cause: classifyFailureCause(item.expectedCorrection.field, item.expectedCorrection.newValue, res?.correction.newValue ?? 'null', fx.transcript, fx.audioSource),
        });
      }
    }
  }

  return {
    split: splitFilter || 'all',
    totalInSplit: targetItems.length,
    evaluatedCount: overall.evaluated,
    audioSources,
    overall,
    perLang,
    perNoise,
    perSpeaker,
    failures,
    latency: {
      firstFrameToFinalP50: percentile(firstFrameToFinal, 50),
      firstFrameToFinalP95: percentile(firstFrameToFinal, 95),
      firstFrameSamples: firstFrameToFinal.length,
      eosToFinalP50: percentile(eosToFinal, 50),
      eosToFinalP95: percentile(eosToFinal, 95),
      eosSamples: eosToFinal.length,
      eosToDangerAlertVisibleP50: percentile(eosToDangerAlertVisible, 50),
      eosToDangerAlertVisibleP95: percentile(eosToDangerAlertVisible, 95),
      eosDangerSamples: eosToDangerAlertVisible.length,
      eosToAlertAudioStartP50: percentile(eosToAlertAudioStart, 50),
      eosToAlertAudioStartP95: percentile(eosToAlertAudioStart, 95),
      eosAlertAudioSamples: eosToAlertAudioStart.length,
    },
  };
}

export function evaluateCorpusFixtures(manifest, fixtures, domain) {
  return evaluateSplit(manifest, fixtures, domain, null);
}
