import { describe, it, expect } from 'vitest';
import { extractVaccinationStatus, type CanonicalVaccine } from './vaccines';

type VaccineCase = {
  id: string;
  vaccineGroup: CanonicalVaccine | 'Multi' | 'NoneDue' | 'NotCaptured' | 'IFA';
  lang: 'en' | 'hi' | 'mr' | 'mix';
  text: string;
  expectedValue: string;
  expectedStatus: 'vaccines' | 'none_due' | 'not_captured';
  expectedIfa?: boolean;
};

const VACCINE_DEV_CASES: VaccineCase[] = [
  // BCG (4)
  { id: 'VAX-01', vaccineGroup: 'BCG', lang: 'en', text: 'HBNC visit weight 3.2 kg vaccinations due BCG next visit 18 November', expectedValue: 'BCG', expectedStatus: 'vaccines' },
  { id: 'VAX-02', vaccineGroup: 'BCG', lang: 'hi', text: 'देय टीके बीसीजी अगली मुलाकात 19 नवंबर', expectedValue: 'BCG', expectedStatus: 'vaccines' },
  { id: 'VAX-03', vaccineGroup: 'BCG', lang: 'mr', text: 'देय लसी बी सी जी पुढील भेट 18 नोव्हेंबर', expectedValue: 'BCG', expectedStatus: 'vaccines' },
  { id: 'VAX-04', vaccineGroup: 'BCG', lang: 'en', text: 'vaccine B-C-G pending', expectedValue: 'BCG', expectedStatus: 'vaccines' },

  // OPV (5)
  { id: 'VAX-05', vaccineGroup: 'OPV', lang: 'en', text: 'vaccinations due OPV next visit 25 November', expectedValue: 'OPV', expectedStatus: 'vaccines' },
  { id: 'VAX-06', vaccineGroup: 'OPV', lang: 'en', text: 'oral polio drops due next visit tomorrow', expectedValue: 'OPV', expectedStatus: 'vaccines' },
  { id: 'VAX-07', vaccineGroup: 'OPV', lang: 'hi', text: 'देय टीके पोलियो अगली मुलाकात 2 दिसंबर', expectedValue: 'OPV', expectedStatus: 'vaccines' },
  { id: 'VAX-08', vaccineGroup: 'OPV', lang: 'mr', text: 'देय लसी ओपीव्ही पुढील भेट 25 नोव्हेंबर', expectedValue: 'OPV', expectedStatus: 'vaccines' },
  { id: 'VAX-09', vaccineGroup: 'OPV', lang: 'mr', text: 'लस पोलिओ द्यायची आहे', expectedValue: 'OPV', expectedStatus: 'vaccines' },

  // DPT (4)
  { id: 'VAX-10', vaccineGroup: 'DPT', lang: 'en', text: 'Immunisation visit vaccinations due DPT next visit 28 November', expectedValue: 'DPT', expectedStatus: 'vaccines' },
  { id: 'VAX-11', vaccineGroup: 'DPT', lang: 'hi', text: 'देय टीके डीपीटी अगली मुलाकात 27 नवंबर', expectedValue: 'DPT', expectedStatus: 'vaccines' },
  { id: 'VAX-12', vaccineGroup: 'DPT', lang: 'mr', text: 'देय लसी D-P-T पुढील भेट 28 नोव्हेंबर', expectedValue: 'DPT', expectedStatus: 'vaccines' },
  { id: 'VAX-13', vaccineGroup: 'DPT', lang: 'hi', text: 'टीका डी पी टी बाकी है', expectedValue: 'DPT', expectedStatus: 'vaccines' },

  // Pentavalent (4)
  { id: 'VAX-14', vaccineGroup: 'Pentavalent', lang: 'en', text: 'vaccinations due Pentavalent next visit 26 November', expectedValue: 'Pentavalent', expectedStatus: 'vaccines' },
  { id: 'VAX-15', vaccineGroup: 'Pentavalent', lang: 'en', text: 'penta 2 vaccine due', expectedValue: 'Pentavalent', expectedStatus: 'vaccines' },
  { id: 'VAX-16', vaccineGroup: 'Pentavalent', lang: 'hi', text: 'देय टीके पेंटावेलेंट अगली मुलाकात 26 नवंबर', expectedValue: 'Pentavalent', expectedStatus: 'vaccines' },
  { id: 'VAX-17', vaccineGroup: 'Pentavalent', lang: 'mr', text: 'देय लसी पेंटाव्हॅलेंट पुढील भेट 26 नोव्हेंबर', expectedValue: 'Pentavalent', expectedStatus: 'vaccines' },

  // Hepatitis B (4)
  { id: 'VAX-18', vaccineGroup: 'Hepatitis B', lang: 'en', text: 'vaccinations due Hepatitis B next visit 16 November', expectedValue: 'Hepatitis B', expectedStatus: 'vaccines' },
  { id: 'VAX-19', vaccineGroup: 'Hepatitis B', lang: 'en', text: 'Hep B birth dose pending', expectedValue: 'Hepatitis B', expectedStatus: 'vaccines' },
  { id: 'VAX-20', vaccineGroup: 'Hepatitis B', lang: 'hi', text: 'देय टीके हेपेटाइटिस बी अगली मुलाकात 17 नवंबर', expectedValue: 'Hepatitis B', expectedStatus: 'vaccines' },
  { id: 'VAX-21', vaccineGroup: 'Hepatitis B', lang: 'mr', text: 'देय लसी हेपॅटायटिस बी पुढील भेट 17 नोव्हेंबर', expectedValue: 'Hepatitis B', expectedStatus: 'vaccines' },

  // Measles / MR (5)
  { id: 'VAX-22', vaccineGroup: 'Measles', lang: 'en', text: 'Immunisation visit vaccinations due Measles', expectedValue: 'Measles', expectedStatus: 'vaccines' },
  { id: 'VAX-23', vaccineGroup: 'Measles', lang: 'hi', text: 'देय टीके खसरा अगली मुलाकात 29 नवंबर', expectedValue: 'Measles', expectedStatus: 'vaccines' },
  { id: 'VAX-24', vaccineGroup: 'Measles', lang: 'mr', text: 'देल असे मीजल्स पुढील भेट उद्या', expectedValue: 'Measles', expectedStatus: 'vaccines' },
  { id: 'VAX-25', vaccineGroup: 'Measles', lang: 'mr', text: 'देय लसी गोवर पुढील भेट 29 नोव्हेंबर', expectedValue: 'Measles', expectedStatus: 'vaccines' },
  { id: 'VAX-26', vaccineGroup: 'MR', lang: 'hi', text: 'देय टीके एमआर अगली मुलाकात 1 दिसंबर', expectedValue: 'MR', expectedStatus: 'vaccines' },

  // TT / TT1 / TT2 (5)
  { id: 'VAX-27', vaccineGroup: 'TT1', lang: 'en', text: 'ANC visit vaccinations due TT1 next visit 21 November', expectedValue: 'TT1', expectedStatus: 'vaccines' },
  { id: 'VAX-28', vaccineGroup: 'TT2', lang: 'mix', text: 'देल्सी TT do. पुढील भेट परवा', expectedValue: 'TT2', expectedStatus: 'vaccines' },
  { id: 'VAX-29', vaccineGroup: 'TT2', lang: 'hi', text: 'देय टीके टीटी दो अगली मुलाकात कल', expectedValue: 'TT2', expectedStatus: 'vaccines' },
  { id: 'VAX-30', vaccineGroup: 'TT1', lang: 'mr', text: 'देय लसी टीटी एक पुढील भेट 20 नोव्हेंबर', expectedValue: 'TT1', expectedStatus: 'vaccines' },
  { id: 'VAX-31', vaccineGroup: 'TT', lang: 'hi', text: 'देय टीके टिटनेस अगली मुलाकात कल', expectedValue: 'TT', expectedStatus: 'vaccines' },

  // Multiple vaccines (2)
  { id: 'VAX-32', vaccineGroup: 'Multi', lang: 'en', text: 'vaccinations due OPV and DPT next visit 25 November', expectedValue: 'OPV and DPT', expectedStatus: 'vaccines' },
  { id: 'VAX-33', vaccineGroup: 'Multi', lang: 'hi', text: 'देय टीके बीसीजी, पोलियो और हेपेटाइटिस बी', expectedValue: 'BCG, OPV, Hepatitis B', expectedStatus: 'vaccines' },

  // None due (3)
  { id: 'VAX-34', vaccineGroup: 'NoneDue', lang: 'en', text: 'ANC visit weight 55 kg vaccinations none due next visit 20 November', expectedValue: 'None reported', expectedStatus: 'none_due' },
  { id: 'VAX-35', vaccineGroup: 'NoneDue', lang: 'hi', text: 'देय टीके कुछ नहीं अगली मुलाकात 29 नवंबर', expectedValue: 'None reported', expectedStatus: 'none_due' },
  { id: 'VAX-36', vaccineGroup: 'NoneDue', lang: 'mr', text: 'लस काही नाही पुढील भेट तीस नोव्हेंबर', expectedValue: 'None reported', expectedStatus: 'none_due' },

  // Not captured (2)
  { id: 'VAX-37', vaccineGroup: 'NotCaptured', lang: 'en', text: 'Vaccinations not captured today, card missing', expectedValue: 'Not captured', expectedStatus: 'not_captured' },
  { id: 'VAX-38', vaccineGroup: 'NotCaptured', lang: 'mr', text: 'देय लसी माहिती नाही', expectedValue: 'Not captured', expectedStatus: 'not_captured' },

  // IFA supplement kept separate from vaccinations due (2)
  { id: 'VAX-39', vaccineGroup: 'IFA', lang: 'en', text: 'ANC visit weight 55 kg IFA tablets given vaccinations none due', expectedValue: 'None reported', expectedStatus: 'none_due', expectedIfa: true },
  { id: 'VAX-40', vaccineGroup: 'IFA', lang: 'hi', text: 'ANC मुलाकात वजन 55 किलो आयरन की गोली दी देय टीके TT2', expectedValue: 'TT2', expectedStatus: 'vaccines', expectedIfa: true },
];

describe('closed vaccine lexicon across Roman, Devanagari, and spoken forms (40 dev tests)', () => {
  it('contains at least 30 dev test cases across en, hi, mr, and code-mix', () => {
    expect(VACCINE_DEV_CASES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(VACCINE_DEV_CASES)(
    '$id ($vaccineGroup / $lang): extracts $expectedValue ($expectedStatus)',
    ({ text, expectedValue, expectedStatus, expectedIfa }) => {
      const res = extractVaccinationStatus(text);
      expect(res.value).toBe(expectedValue);
      expect(res.status).toBe(expectedStatus);
      if (expectedIfa !== undefined) {
        expect(res.ifaMentioned).toBe(expectedIfa);
      }
    },
  );
});
