import { describe, it, expect } from 'vitest';
import { extract, extractDetailed } from './extraction';
import { parseVisitDate } from './dateParser';
import { correctField } from './correction';
import type { VisitFields, VisitType } from './types';

const today = '2026-11-13';
const base: VisitFields = {
  beneficiaryId: 'BEN-1001',
  visitType: 'ANC',
  weight: '55 kg',
  vaccinationsDue: 'None reported',
  nextVisitDate: '2026-11-20',
};

describe('visit extraction and dates', () => {
  it('extracts all five structured fields from the demo sentence', () =>
    expect(
      extract('Aaj mi Sunita cha ANC follow-up visit ghetla. Weight 55 kilo aahe. Pudhil visit 20 November la theva.', 'BEN-1001', today),
    ).toEqual({
      beneficiaryId: 'BEN-1001',
      visitType: 'ANC',
      weight: '55 kg',
      vaccinationsDue: 'None reported',
      nextVisitDate: '2026-11-20',
    }));

  it('converts Devanagari numerals and vaccination names', () =>
    expect(extract('वजन ५६ किलो, vaccinations due OPV', 'BEN-1002', today)).toMatchObject({
      weight: '56 kg',
      vaccinationsDue: 'OPV',
    }));

  it('extracts Hindi weight with nuqta (वज़न)', () =>
    expect(extract('वज़न 58 किलो', 'BEN-1001', today).weight).toBe('58 kg'));

  it('extracts spoken English weights and Indian numeric dates from the recognized transcript', () =>
    expect(extract('weight is twenty five kgl And next visit date will be 14th 11 2026.', 'BEN-1001', today)).toMatchObject({
      weight: '25 kg',
      nextVisitDate: '2026-11-14',
    }));

  it('extracts spoken Hindi and Marathi weight numbers', () => {
    expect(extract('वजन पच्चीस किलो', 'BEN-1001', today).weight).toBe('25 kg');
    expect(extract('वजन पंचवीस किलो', 'BEN-1001', today).weight).toBe('25 kg');
  });

  it('does not accept impossible spoken dates', () => expect(parseVisitDate('31/02/2026', today)).toBe(''));
  it('parses Hindi relative dates', () => expect(parseVisitDate('कल', today)).toBe('2026-11-14'));
  it('parses Marathi relative dates', () => expect(parseVisitDate('परवा', today)).toBe('2026-11-15'));
  it('parses Hindi and Marathi month names and spoken day words from Prisma v3.0', () => {
    expect(parseVisitDate('22 नवंबर', today)).toBe('2026-11-22');
    expect(parseVisitDate('22 नोव्हेंबर', today)).toBe('2026-11-22');
    expect(parseVisitDate('पुढील भेट वीस नोव्हेंबर।', today)).toBe('2026-11-20');
    expect(parseVisitDate('अगली मुलाकात पच्चीस नवंबर।', today)).toBe('2026-11-25');
  });
  it('extracts spoken decimals, hyphenated acronyms, and phonetic BAN IDs observed from Prisma v3.0', () => {
    expect(extract('वजन तीन point दोन किलो आहे', 'BEN-1002', today).weight).toBe('3.2 kg');
    expect(extract('H-B-Y-C visit, vaccinations due O-P-V and D-P-T', 'BEN-1003', today)).toMatchObject({
      visitType: 'HBYC',
      vaccinationsDue: 'OPV and DPT',
    });
    expect(correctField('Beneficiary ID is BAN1002.', base)?.fields.beneficiaryId).toBe('BEN-1002');
  });
  it('parses next Monday against injected today', () => expect(parseVisitDate('next Monday', today)).toBe('2026-11-16'));

  it('parses spoken English, Hindi, and Marathi numeric dates (including twenty-one eleven twenty twenty-six)', () => {
    expect(
      extract('Weight twenty-five kg and expiry date will be twenty-one eleven twenty twenty-six सामान।', 'BEN-1002', today),
    ).toMatchObject({
      weight: '25 kg',
      nextVisitDate: '2026-11-21',
    });
    expect(parseVisitDate('next visit twenty-first eleven two thousand twenty-six', today)).toBe('2026-11-21');
    expect(parseVisitDate('next visit twenty-one slash eleven slash twenty twenty-six', today)).toBe('2026-11-21');
    expect(parseVisitDate('next visit 21/11/26', today)).toBe('2026-11-21');
    expect(parseVisitDate('next visit November twenty-first twenty twenty-six', today)).toBe('2026-11-21');
    expect(parseVisitDate('अगली मुलाक़ात इक्कीस ग्यारह दो हजार छब्बीस', today)).toBe('2026-11-21');
    expect(parseVisitDate('पुढील भेट एकवीस अकरा दोन हजार सव्वीस', today)).toBe('2026-11-21');
    expect(parseVisitDate('पुढील भेट 21 तारखेला', today)).toBe('2026-11-21');
    expect(parseVisitDate('Baby weight 3.2 kg BCG given', today)).toBe('');
  });
});

describe('field-specific correction history', () => {
  const fixedNow = new Date('2026-11-13T12:00:00Z');

  it.each([
    ['No, weight is 56 kilo', 'weight', '55 kg', '56 kg'],
    ['वज़न 57 किलो है', 'weight', '55 kg', '57 kg'],
    ['वजन 58 किलो आहे', 'weight', '55 kg', '58 kg'],
    ['next visit 22 November', 'nextVisitDate', '2026-11-20', '2026-11-22'],
    ['अगली मुलाक़ात 22 नवंबर', 'nextVisitDate', '2026-11-20', '2026-11-22'],
    ['पुढील भेट 22 नोव्हेंबर', 'nextVisitDate', '2026-11-20', '2026-11-22'],
    ['vaccinations due: OPV and DPT', 'vaccinationsDue', 'None reported', 'OPV and DPT'],
    ['visit type is PNC', 'visitType', 'ANC', 'PNC'],
    ['beneficiary ID is BEN-1002', 'beneficiaryId', 'BEN-1001', 'BEN-1002'],
  ] as const)('corrects only %s and records old/new/time', (text, field, oldValue, newValue) => {
    const result = correctField(text, base, fixedNow);
    expect(result).not.toBeNull();
    expect(result?.correction).toEqual({
      field,
      oldValue,
      newValue,
      timestamp: '2026-11-13T12:00:00.000Z',
    });
    expect(result?.fields).toEqual({ ...base, [field]: newValue });
  });

  it.each(['ANC', 'PNC', 'HBNC', 'HBYC', 'Immunisation', 'General'] as VisitType[])(
    'supports correcting visit type to %s',
    (targetType) => {
      const starting: VisitFields = { ...base, visitType: targetType === 'ANC' ? 'General' : 'ANC' };
      const result = correctField(`visit type is ${targetType}`, starting, fixedNow);
      expect(result?.fields).toEqual({ ...starting, visitType: targetType });
      expect(result?.correction.newValue).toBe(targetType);
    },
  );
});

describe('context-assisted closed-set visit-type resolution', () => {
  it('resolves fuzzy uppercase visit-type acronym using beneficiary context and marks source=context', () => {
    const newborn = extractDetailed('लाभार्थी BEN-1002 साठी HPMC भेट वजन 3.2 किलो', 'BEN-1002', today, 'Newborn');
    expect(newborn.fields.visitType).toBe('HBNC');
    expect(newborn.visitTypeSource).toBe('context');

    const child = extractDetailed('BEN-1003 HBYK visit weight 9 kg', 'BEN-1003', today, 'Child');
    expect(child.fields.visitType).toBe('HBYC');
    expect(child.visitTypeSource).toBe('context');

    const pregnant = extractDetailed('BEN-1001 AMC visit weight 55 kg', 'BEN-1001', today, 'Pregnant');
    expect(pregnant.fields.visitType).toBe('ANC');
    expect(pregnant.visitTypeSource).toBe('context');
  });

  it('never overrides a clear explicit visit type mention regardless of beneficiary kind', () => {
    const newbornGeneral = extractDetailed('General visit weight 3.2 kg', 'BEN-1002', today, 'Newborn');
    expect(newbornGeneral.fields.visitType).toBe('General');
    expect(newbornGeneral.visitTypeSource).toBe('explicit');

    const pregnantImm = extractDetailed('Immunisation visit vaccinations due TT2', 'BEN-1001', today, 'Pregnant');
    expect(pregnantImm.fields.visitType).toBe('Immunisation');
    expect(pregnantImm.visitTypeSource).toBe('explicit');

    const newbornPnc = extractDetailed('PNC visit weight 3.1 kg', 'BEN-1002', today, 'Newborn');
    expect(newbornPnc.fields.visitType).toBe('PNC');
    expect(newbornPnc.visitTypeSource).toBe('explicit');
  });

  it('does not spuriously match ordinary words or unrelated acronyms', () => {
    const ordinary = extractDetailed('Baby weight 3.2 kg BCG given', 'BEN-1002', today, 'Newborn');
    expect(ordinary.fields.visitType).toBe('General');
    expect(ordinary.visitTypeSource).toBe('default');
  });
});
