import { describe, it, expect } from 'vitest';
import { correctField } from './correction';
import type { VisitFields } from './types';

const fixedNow = new Date('2026-11-13T12:00:00Z');
const base: VisitFields = {
  beneficiaryId: 'BEN-1001',
  visitType: 'ANC',
  weight: '55 kg',
  vaccinationsDue: 'None reported',
  nextVisitDate: '2026-11-20',
};

type CorrectionCase = {
  id: string;
  lang: 'en' | 'hi' | 'mr' | 'mix';
  field: keyof VisitFields;
  text: string;
  expected: string;
};

const CORRECTION_CASES: CorrectionCase[] = [
  // Weight (10: digits, spoken words, decimals, en/hi/mr)
  { id: 'C-WT-01', lang: 'en', field: 'weight', text: 'No, weight is 56 kilo.', expected: '56 kg' },
  { id: 'C-WT-02', lang: 'en', field: 'weight', text: 'Weight is fifty seven kg.', expected: '57 kg' },
  { id: 'C-WT-03', lang: 'en', field: 'weight', text: 'Weight 3.4 kg', expected: '3.4 kg' },
  { id: 'C-WT-04', lang: 'en', field: 'weight', text: 'Weight is three point two kilo.', expected: '3.2 kg' },
  { id: 'C-WT-05', lang: 'hi', field: 'weight', text: 'नहीं, वज़न 58 किलो है।', expected: '58 kg' },
  { id: 'C-WT-06', lang: 'hi', field: 'weight', text: 'नहीं, वज़न छप्पन किलो है।', expected: '56 kg' },
  { id: 'C-WT-07', lang: 'hi', field: 'weight', text: 'वज़न तीन पॉइंट चार किलो है।', expected: '3.4 kg' },
  { id: 'C-WT-08', lang: 'mr', field: 'weight', text: 'नाही, वजन 54 किलो आहे.', expected: '54 kg' },
  { id: 'C-WT-09', lang: 'mr', field: 'weight', text: 'वजन अठ्ठावन्न किलो आहे.', expected: '58 kg' },
  { id: 'C-WT-10', lang: 'mr', field: 'weight', text: 'वजन तीन point दोन किलो आहे.', expected: '3.2 kg' },

  // Next visit date (10: named, relative, spoken numeric, numeric dd/mm/yy, en/hi/mr)
  { id: 'C-DT-01', lang: 'en', field: 'nextVisitDate', text: 'No, next visit is 22 November.', expected: '2026-11-22' },
  { id: 'C-DT-02', lang: 'en', field: 'nextVisitDate', text: 'Next visit date will be twenty-one eleven twenty twenty-six.', expected: '2026-11-21' },
  { id: 'C-DT-03', lang: 'en', field: 'nextVisitDate', text: 'Next visit date tomorrow.', expected: '2026-11-14' },
  { id: 'C-DT-04', lang: 'en', field: 'nextVisitDate', text: 'Next visit 25/11/26.', expected: '2026-11-25' },
  { id: 'C-DT-05', lang: 'hi', field: 'nextVisitDate', text: 'अगली मुलाक़ात 25 नवंबर।', expected: '2026-11-25' },
  { id: 'C-DT-06', lang: 'hi', field: 'nextVisitDate', text: 'अगली मुलाक़ात इक्कीस ग्यारह दो हजार छब्बीस।', expected: '2026-11-21' },
  { id: 'C-DT-07', lang: 'hi', field: 'nextVisitDate', text: 'अगली भेट परसों।', expected: '2026-11-15' },
  { id: 'C-DT-08', lang: 'mr', field: 'nextVisitDate', text: 'पुढील भेट 26 नोव्हेंबर.', expected: '2026-11-26' },
  { id: 'C-DT-09', lang: 'mr', field: 'nextVisitDate', text: 'पुढील भेट एकवीस अकरा दोन हजार सव्वीस.', expected: '2026-11-21' },
  { id: 'C-DT-10', lang: 'mr', field: 'nextVisitDate', text: 'पुढील भेट 24 तारखेला.', expected: '2026-11-24' },

  // Vaccinations due (9: closed lexicon across en/hi/mr + multi + not captured)
  { id: 'C-VX-01', lang: 'en', field: 'vaccinationsDue', text: 'Vaccinations due: OPV and DPT.', expected: 'OPV and DPT' },
  { id: 'C-VX-02', lang: 'en', field: 'vaccinationsDue', text: 'Vaccinations due: Hepatitis B.', expected: 'Hepatitis B' },
  { id: 'C-VX-03', lang: 'en', field: 'vaccinationsDue', text: 'Vaccinations due: Pentavalent.', expected: 'Pentavalent' },
  { id: 'C-VX-04', lang: 'hi', field: 'vaccinationsDue', text: 'देय टीके: TT2।', expected: 'TT2' },
  { id: 'C-VX-05', lang: 'hi', field: 'vaccinationsDue', text: 'देय टीके खसरा।', expected: 'Measles' },
  { id: 'C-VX-06', lang: 'hi', field: 'vaccinationsDue', text: 'देय टीके पोलियो।', expected: 'OPV' },
  { id: 'C-VX-07', lang: 'mr', field: 'vaccinationsDue', text: 'देय लसी: BCG.', expected: 'BCG' },
  { id: 'C-VX-08', lang: 'mr', field: 'vaccinationsDue', text: 'देय लसी गोवर.', expected: 'Measles' },
  { id: 'C-VX-09', lang: 'en', field: 'vaccinationsDue', text: 'Vaccinations due: not captured.', expected: 'Not captured' },

  // Visit type (9: all 6 types + fuzzy explicit cue + Devanagari)
  { id: 'C-VT-01', lang: 'en', field: 'visitType', text: 'Visit type is PNC.', expected: 'PNC' },
  { id: 'C-VT-02', lang: 'en', field: 'visitType', text: 'Change visit type to HBNC.', expected: 'HBNC' },
  { id: 'C-VT-03', lang: 'en', field: 'visitType', text: 'Change visit type to HPMC.', expected: 'HBNC' },
  { id: 'C-VT-04', lang: 'en', field: 'visitType', text: 'Visit type is HBYC.', expected: 'HBYC' },
  { id: 'C-VT-05', lang: 'en', field: 'visitType', text: 'Visit type is General.', expected: 'General' },
  { id: 'C-VT-06', lang: 'hi', field: 'visitType', text: 'मुलाक़ात का प्रकार टीकाकरण।', expected: 'Immunisation' },
  { id: 'C-VT-07', lang: 'hi', field: 'visitType', text: 'मुलाक़ात का प्रकार सामान्य।', expected: 'General' },
  { id: 'C-VT-08', lang: 'mr', field: 'visitType', text: 'भेटीचा प्रकार लसीकरण.', expected: 'Immunisation' },
  { id: 'C-VT-09', lang: 'mr', field: 'visitType', text: 'भेटीचा प्रकार पी एन सी.', expected: 'PNC' },

  // Beneficiary ID (7: en/hi/mr + phonetic BAN + Devanagari ID + spoken digits)
  { id: 'C-ID-01', lang: 'en', field: 'beneficiaryId', text: 'Beneficiary ID is BEN-1002.', expected: 'BEN-1002' },
  { id: 'C-ID-02', lang: 'en', field: 'beneficiaryId', text: 'Beneficiary ID is BAN1003.', expected: 'BEN-1003' },
  { id: 'C-ID-03', lang: 'hi', field: 'beneficiaryId', text: 'लाभार्थी ID BEN-1004 है।', expected: 'BEN-1004' },
  { id: 'C-ID-04', lang: 'hi', field: 'beneficiaryId', text: 'लाभार्थी आईडी बेन 1005 है।', expected: 'BEN-1005' },
  { id: 'C-ID-05', lang: 'mr', field: 'beneficiaryId', text: 'लाभार्थी ID BEN-1004 आहे.', expected: 'BEN-1004' },
  { id: 'C-ID-06', lang: 'mr', field: 'beneficiaryId', text: 'लाभार्थी आयडी पिन एक शून्य शून्य चार आहे.', expected: 'BEN-1004' },
  { id: 'C-ID-07', lang: 'mr', field: 'beneficiaryId', text: 'लाभार्थी आयडी बॅन एक हजार दोन आहे.', expected: 'BEN-1002' },
];

describe('expanded correction coverage across all 5 fields and 3 languages (45 cases)', () => {
  it('defines at least 40 correction test cases across all 5 fields and 3 languages', () => {
    expect(CORRECTION_CASES.length).toBeGreaterThanOrEqual(40);
    const fields = new Set(CORRECTION_CASES.map((c) => c.field));
    expect(fields.size).toBe(5);
    const langs = new Set(CORRECTION_CASES.map((c) => c.lang));
    expect(langs.has('en') && langs.has('hi') && langs.has('mr')).toBe(true);
  });

  it.each(CORRECTION_CASES)(
    '$id ($field / $lang): updates only $field -> $expected',
    ({ field, text, expected }) => {
      const res = correctField(text, base, fixedNow);
      expect(res, text).not.toBeNull();
      expect(res?.correction.field).toBe(field);
      expect(res?.correction.newValue).toBe(expected);
      expect(res?.correction.oldValue).toBe(base[field]);
      expect(res?.fields).toEqual({ ...base, [field]: expected });
    },
  );
});
