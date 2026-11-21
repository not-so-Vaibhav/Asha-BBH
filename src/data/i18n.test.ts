import { describe, it, expect } from 'vitest';
import { copy, extraCopy, localizeAge, localizeDue } from './i18n';
import { beneficiaries } from './seed';
import { ruleCategories, rules } from '../domain/rules';
import type { Language } from '../domain/types';

const languages: Language[] = ['en', 'hi', 'mr'];

describe('language dictionaries', () => {
  it('provide the same keys for all supported languages', () => {
    expect(Object.keys(copy.hi).sort()).toEqual(Object.keys(copy.en).sort());
    expect(Object.keys(copy.mr).sort()).toEqual(Object.keys(copy.en).sort());
    expect(Object.keys(extraCopy.hi).sort()).toEqual(Object.keys(extraCopy.en).sort());
    expect(Object.keys(extraCopy.mr).sort()).toEqual(Object.keys(extraCopy.en).sort());
  });

  it('localizes copy keys into Hindi and Marathi (no leftover untranslated English)', () => {
    for (const key of Object.keys(copy.en) as Array<keyof typeof copy.en>) {
      expect(copy.hi[key], `copy.hi.${key}`).not.toBe(copy.en[key]);
      expect(copy.mr[key], `copy.mr.${key}`).not.toBe(copy.en[key]);
    }
  });

  it('localizes non-brand extraCopy keys into Hindi and Marathi', () => {
    const brandOrAcronymKeys = new Set(['anc', 'pnc', 'hbnc', 'hbyc', 'gnaniLabel', 'speechGnani']);
    for (const key of Object.keys(extraCopy.en) as Array<keyof typeof extraCopy.en>) {
      if (brandOrAcronymKeys.has(key)) continue;
      expect(extraCopy.hi[key], `extraCopy.hi.${key}`).not.toBe(extraCopy.en[key]);
      expect(extraCopy.mr[key], `extraCopy.mr.${key}`).not.toBe(extraCopy.en[key]);
    }
  });

  it('localizes every danger rule category and wording across all languages', () => {
    for (const rule of rules) {
      expect(ruleCategories[rule.id]).toBeDefined();
      for (const lang of languages) {
        expect(rule.wording[lang]).toBeTruthy();
        expect(ruleCategories[rule.id][lang]).toBeTruthy();
      }
      expect(ruleCategories[rule.id].hi).not.toBe(ruleCategories[rule.id].en);
      expect(ruleCategories[rule.id].mr).not.toBe(ruleCategories[rule.id].en);
    }
  });

  it('localizes seeded beneficiary ages and due labels in Hindi and Marathi', () => {
    for (const b of beneficiaries) {
      expect(localizeAge(b.age, 'hi')).not.toBe(b.age);
      expect(localizeAge(b.age, 'mr')).not.toBe(b.age);
      expect(localizeDue(b.due, 'hi')).not.toBe(b.due);
      expect(localizeDue(b.due, 'mr')).not.toBe(b.due);
    }
  });
});
