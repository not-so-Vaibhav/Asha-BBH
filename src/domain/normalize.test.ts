import { describe, it, expect } from 'vitest';
import { normalizeTranscript, stripNuqta, toWesternDigits } from './normalize';

describe('transcript normalization', () => {
  it('converts Devanagari numerals and strips nuqta variants', () => {
    expect(toWesternDigits('वज़न ५६ किलो')).toBe('वज़न 56 किलो');
    expect(stripNuqta('वज़न ५६ फ़रवरी')).toBe('वजन ५६ फरवरी');
  });

  it('normalizes spoken Beneficiary IDs, visit acronyms, and weight units', () => {
    expect(normalizeTranscript('B E N 1001 ए एन सी वजन 55 किलो')).toBe('BEN-1001 ANC वजन 55 kg');
    expect(normalizeTranscript('बेन 1002 एच बी एन सी weight 3.2 kgl')).toBe('BEN-1002 HBNC weight 3.2 kg');
    expect(normalizeTranscript('पीएनसी 20 नवम्बर टिकाकरण')).toBe('PNC 20 नवंबर टीकाकरण');
  });
});
