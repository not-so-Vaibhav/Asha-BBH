import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extract } from '../../src/domain/extraction';
import { correctField } from '../../src/domain/correction';
import { scanDangerSigns } from '../../src/domain/rules';
import { canonicalizeVaccinationField } from '../../src/domain/vaccines';
import type { BeneficiaryKind, Language, VisitFields } from '../../src/domain/types';

type ManifestUtterance = {
  id: string;
  split: 'dev' | 'test_v1' | 'test_v2';
  fileName: string;
  category: 'normal' | 'danger' | 'negation' | 'correction';
  language: 'en' | 'hi' | 'mr' | 'mix';
  noiseLevel: 'clean' | 'street' | 'household';
  speaker: string;
  beneficiaryId: string;
  beneficiaryKind: BeneficiaryKind;
  promptText: string;
  expectedFields: VisitFields | null;
  expectedDangerRuleIds: string[];
  expectedNeedsReview: boolean;
  baseFields: VisitFields | null;
  expectedCorrection: { field: keyof VisitFields; oldValue: string; newValue: string } | null;
};

type Manifest = {
  referenceDate: string;
  counts: { total: number; dev: number; test_v1: number; test_v2: number; normal: number; danger: number; negation: number; correction: number };
  utterances: ManifestUtterance[];
};

type FixtureFile = {
  generatedAt: string | null;
  entries: Array<{ id: string; transcript: string; audioSource: string; error: string | null }>;
};

const manifestPath = path.resolve(process.cwd(), 'tests/corpus/manifest.json');
const frozenV1Path = path.resolve(process.cwd(), 'tests/corpus/test_split_frozen.json');
const frozenV2Path = path.resolve(process.cwd(), 'tests/corpus/test_v2_frozen.json');
const fixturesPath = path.resolve(process.cwd(), 'tests/corpus/fixtures/gnani_transcripts.json');

describe('Gnani evaluation corpus splits, frozen hashes, and offline regression fixtures', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;

  it('defines 40 dev, 40 seen test_v1, and 120 frozen unseen test_v2 utterances with verified SHA-256 hashes', () => {
    expect(manifest.utterances.length).toBe(200);
    const dev = manifest.utterances.filter((u) => u.split === 'dev');
    const testV1 = manifest.utterances.filter((u) => u.split === 'test_v1');
    const testV2 = manifest.utterances.filter((u) => u.split === 'test_v2');
    expect(dev).toHaveLength(40);
    expect(testV1).toHaveLength(40);
    expect(testV2).toHaveLength(120);

    // Verify test_v1 hash (marked seen_regression_only)
    const frozenV1 = JSON.parse(fs.readFileSync(frozenV1Path, 'utf8')) as {
      status: string;
      count: number;
      sha256: string;
      testIds: string[];
    };
    expect(frozenV1.status).toBe('seen_regression_only');
    expect(frozenV1.count).toBe(40);
    expect(testV1.map((u) => u.id)).toEqual(frozenV1.testIds);
    expect(crypto.createHash('sha256').update(JSON.stringify(frozenV1.testIds)).digest('hex')).toBe(frozenV1.sha256);

    // Verify test_v2 hash and >=30 per headline metric + >=20 negations + 2 speakers + >=50% noisy
    const frozenV2 = JSON.parse(fs.readFileSync(frozenV2Path, 'utf8')) as {
      status: string;
      count: number;
      sha256: string;
      testV2Ids: string[];
    };
    expect(frozenV2.status).toBe('unseen_human_held_out');
    expect(frozenV2.count).toBe(120);
    expect(testV2.map((u) => u.id)).toEqual(frozenV2.testV2Ids);
    expect(crypto.createHash('sha256').update(JSON.stringify(frozenV2.testV2Ids)).digest('hex')).toBe(frozenV2.sha256);

    expect(testV2.filter((u) => u.category === 'normal').length).toBeGreaterThanOrEqual(30);
    expect(testV2.filter((u) => u.category === 'danger').length).toBeGreaterThanOrEqual(30);
    expect(testV2.filter((u) => u.category === 'correction').length).toBeGreaterThanOrEqual(30);
    expect(testV2.filter((u) => u.category === 'negation').length).toBeGreaterThanOrEqual(20);

    const speakersV2 = new Set(testV2.map((u) => u.speaker));
    expect(speakersV2.size).toBeGreaterThanOrEqual(2);
    const noisyV2 = testV2.filter((u) => u.noiseLevel === 'household' || u.noiseLevel === 'street').length;
    expect(noisyV2).toBeGreaterThanOrEqual(testV2.length / 2);

    const allSevenRules = ['PREG-01', 'PREG-02', 'NB-01', 'NB-02', 'NB-03', 'NB-04', 'NB-05'];
    for (const splitItems of [dev, testV1, testV2]) {
      const covered = new Set(splitItems.flatMap((u) => u.expectedDangerRuleIds));
      for (const r of allSevenRules) expect(covered.has(r)).toBe(true);
    }

    // In test_v2, every rule must appear in en, hi, and mr
    for (const r of allSevenRules) {
      const ruleItems = testV2.filter((u) => u.category === 'danger' && u.expectedDangerRuleIds.includes(r));
      const langs = new Set(ruleItems.map((u) => u.language));
      expect(langs.has('en'), `test_v2 ${r} en`).toBe(true);
      expect(langs.has('hi'), `test_v2 ${r} hi`).toBe(true);
      expect(langs.has('mr'), `test_v2 ${r} mr`).toBe(true);
    }
  });

  it('achieves 100% danger recall and 0 false alerts on dev + test_v1 canonical prompts (never touches test_v2)', () => {
    const seenRegression = manifest.utterances.filter((u) => u.split === 'dev' || u.split === 'test_v1');
    for (const item of seenRegression) {
      const lang: Language = item.language === 'mix' ? 'en' : item.language;
      if (item.category === 'danger') {
        const matches = scanDangerSigns(item.promptText, item.beneficiaryKind, lang, true);
        const ids = matches.map((m) => m.rule.id);
        for (const expectedRule of item.expectedDangerRuleIds) {
          expect(ids, `${item.id} missed ${expectedRule}`).toContain(expectedRule);
        }
      } else if (item.category === 'negation') {
        const matches = scanDangerSigns(item.promptText, item.beneficiaryKind, lang, true);
        if (item.expectedDangerRuleIds.length === 0) {
          expect(matches, `${item.id} false-alerted`).toEqual([]);
        } else {
          for (const expectedRule of item.expectedDangerRuleIds) {
            const found = matches.find((m) => m.rule.id === expectedRule);
            expect(found, `${item.id} missed ambiguous ${expectedRule}`).toBeDefined();
            if (item.expectedNeedsReview) expect(found?.needsReview).toBe(true);
          }
        }
      } else if (item.category === 'normal' && item.expectedFields) {
        const got = extract(item.promptText, item.beneficiaryId, manifest.referenceDate, item.beneficiaryKind);
        expect({ ...got, vaccinationsDue: canonicalizeVaccinationField(got.vaccinationsDue) }, item.id).toEqual({
          ...item.expectedFields,
          vaccinationsDue: canonicalizeVaccinationField(item.expectedFields.vaccinationsDue),
        });
      } else if (item.category === 'correction' && item.baseFields && item.expectedCorrection) {
        const res = correctField(item.promptText, item.baseFields, new Date(`${manifest.referenceDate}T12:00:00Z`));
        expect(res, item.id).not.toBeNull();
        expect(res?.correction.field, item.id).toBe(item.expectedCorrection.field);
        expect(res?.correction.newValue, item.id).toBe(item.expectedCorrection.newValue);
      }
    }
  });

  it('validates saved real Gnani regression fixtures offline (dev + test_v1: 100% danger recall, 0 false alerts; 0 synthetic test_v2)', () => {
    expect(fs.existsSync(fixturesPath)).toBe(true);
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8')) as FixtureFile;
    expect(fixtures.entries.length).toBeGreaterThan(0);

    const byId = new Map(manifest.utterances.map((u) => [u.id, u]));
    let dangerExpected = 0;
    let dangerRecalled = 0;
    let falseAlerts = 0;
    let syntheticTestV2 = 0;

    for (const entry of fixtures.entries) {
      const item = byId.get(entry.id);
      expect(item).toBeDefined();
      if (!item || entry.error || !entry.transcript) continue;
      if (item.split === 'test_v2' && entry.audioSource !== 'human-recorded') syntheticTestV2 += 1;
      if (item.split !== 'dev' && item.split !== 'test_v1') continue;

      const lang: Language = item.language === 'mix' ? 'en' : item.language;
      if (item.category === 'danger' || (item.category === 'negation' && item.expectedDangerRuleIds.length > 0)) {
        const matches = scanDangerSigns(entry.transcript, item.beneficiaryKind, lang, true);
        for (const expectedRule of item.expectedDangerRuleIds) {
          dangerExpected += 1;
          const match = matches.find((m) => m.rule.id === expectedRule);
          if (match && (!item.expectedNeedsReview || match.needsReview)) {
            dangerRecalled += 1;
          }
        }
      } else if (item.category === 'negation' || item.category === 'normal') {
        const matches = scanDangerSigns(entry.transcript, item.beneficiaryKind, lang, true);
        if (matches.length > 0) falseAlerts += 1;
      }
    }

    expect(syntheticTestV2).toBe(0);
    expect(dangerExpected).toBeGreaterThan(0);
    expect(dangerRecalled).toBe(dangerExpected);
    expect(falseAlerts).toBe(0);
  });
});
