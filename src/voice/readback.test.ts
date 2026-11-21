import { describe, it, expect } from 'vitest';
import { beneficiaries } from '../data/seed';
import {
  PREGEN_READBACK_TEMPLATES,
  findPregeneratedReadbackUrl,
  getPregeneratedReadbackEntries,
  recordText,
} from './readback';
import type { Language, VisitFields } from '../domain/types';

describe('pre-generated read-back template cache integrity', () => {
  it('covers en, hi, and mr for every high-likelihood visit template', () => {
    const entries = getPregeneratedReadbackEntries();
    expect(entries.length).toBe(PREGEN_READBACK_TEMPLATES.length * 3);
    for (const lang of ['en', 'hi', 'mr'] as Language[]) {
      expect(getPregeneratedReadbackEntries(lang).length).toBe(PREGEN_READBACK_TEMPLATES.length);
    }
  });

  it('matches known normal visit, weight correction, and date correction templates across all 3 languages', () => {
    const sunita = beneficiaries[0];
    for (const lang of ['en', 'hi', 'mr'] as Language[]) {
      const normal = recordText(
        sunita,
        { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' },
        lang,
      );
      expect(findPregeneratedReadbackUrl(normal, lang)).toBe(`/audio/readback/anc-55-20nov-${lang}.wav`);

      const corrected = recordText(
        sunita,
        { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' },
        lang,
      );
      expect(findPregeneratedReadbackUrl(corrected, lang)).toBe(`/audio/readback/anc-56-20nov-${lang}.wav`);
    }
  });

  it('uses cached read-back ONLY when spoken record values match the template exactly; any single-field mutation returns null', () => {
    const sunita = beneficiaries[0];
    const exactFields: VisitFields = {
      beneficiaryId: 'BEN-1001',
      visitType: 'ANC',
      weight: '55 kg',
      vaccinationsDue: 'None reported',
      nextVisitDate: '2026-11-20',
    };

    for (const lang of ['en', 'hi', 'mr'] as Language[]) {
      expect(findPregeneratedReadbackUrl(recordText(sunita, exactFields, lang, false), lang)).toBe(
        `/audio/readback/anc-55-20nov-${lang}.wav`,
      );

      // Mutate each field individually — NONE may match a cached template
      const mutations: Array<[string, VisitFields, boolean]> = [
        ['beneficiaryId', { ...exactFields, beneficiaryId: 'BEN-1004' }, false],
        ['visitType', { ...exactFields, visitType: 'PNC' }, false],
        ['weight', { ...exactFields, weight: '55.5 kg' }, false],
        ['vaccinationsDue', { ...exactFields, vaccinationsDue: 'TT1' }, false],
        ['nextVisitDate', { ...exactFields, nextVisitDate: '2026-11-21' }, false],
        ['contextCue', exactFields, true],
      ];

      for (const [label, mutated, fromContext] of mutations) {
        const text = recordText(sunita, mutated, lang, fromContext);
        expect(findPregeneratedReadbackUrl(text, lang), `${lang}:${label} must not match cache`).toBeNull();
      }
    }
  });

  it('normalizes Devanagari digits during cache lookup and returns null for novel uncached values', () => {
    const sunita = beneficiaries[0];
    const hiText = recordText(
      sunita,
      { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' },
      'hi',
    ).replace(/20/, '२०');
    expect(findPregeneratedReadbackUrl(hiText, 'hi')).toBe('/audio/readback/anc-55-20nov-hi.wav');

    const novel = recordText(
      sunita,
      { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '59 kg', vaccinationsDue: 'TT2', nextVisitDate: '2026-11-29' },
      'en',
    );
    expect(findPregeneratedReadbackUrl(novel, 'en')).toBeNull();
  });
});
