import { normalizeTranscript } from './normalize';

/**
 * Closed vaccine lexicon for PS1 "Vaccinations due" field across Roman, Devanagari, and spoken variants.
 * IFA tablets are tracked separately as an iron-folic supplement flag (not mixed into vaccines).
 */
export type CanonicalVaccine =
  | 'BCG'
  | 'OPV'
  | 'DPT'
  | 'Pentavalent'
  | 'Hepatitis B'
  | 'Measles'
  | 'MR'
  | 'TT1'
  | 'TT2'
  | 'TT';

export type VaccinationStatus = 'vaccines' | 'none_due' | 'not_captured';

export type VaccinationExtraction = {
  value: string;
  status: VaccinationStatus;
  vaccines: CanonicalVaccine[];
  ifaMentioned: boolean;
};

const bStart = '(?<![a-zA-Z0-9_\\u0900-\\u097F])';
const bEnd = '(?![a-zA-Z0-9_\\u0900-\\u097F])';

const VACCINE_PATTERNS: Array<{ canonical: CanonicalVaccine; pattern: RegExp }> = [
  {
    canonical: 'BCG',
    pattern: new RegExp(`${bStart}(?:bcg|b[\\s.-]*c[\\s.-]*g|बीसीजी|बी\\s*सी\\s*जी|बी\\s*सी\\s*जे)${bEnd}`, 'iu'),
  },
  {
    canonical: 'OPV',
    pattern: new RegExp(
      `${bStart}(?:opv|o[\\s.-]*p[\\s.-]*v|oral\\s+polio(?:\\s+vaccine)?|polio(?:\\s+drops?)?|ओपीवी|ओपीव्ही|ओ\\s*पी\\s*वी|ओ\\s*पी\\s*व्ही|पोलियो|पोलिओ)${bEnd}`,
      'iu',
    ),
  },
  {
    canonical: 'Pentavalent',
    pattern: new RegExp(`${bStart}(?:pentavalent|penta(?:\\s*[123])?|पेंटावेलेंट|पेंटाव्हॅलेंट|पेंटावॅलेंट|पेंटा)${bEnd}`, 'iu'),
  },
  {
    canonical: 'DPT',
    pattern: new RegExp(`${bStart}(?:dpt|d[\\s.-]*p[\\s.-]*t|डीपीटी|डी\\s*पी\\s*टी|डिप्थीरिया|डीपीटी\\s*बूस्टर)${bEnd}`, 'iu'),
  },
  {
    canonical: 'Hepatitis B',
    pattern: new RegExp(
      `${bStart}(?:hepatitis[\\s-]*b|hep[\\s-]*b|हेपेटाइटिस\\s*बी|हेपॅटायटिस\\s*बी|हिपॅटायटीस\\s*बी|हेप\\s*बी|हेपेटायटिस\\s*बी)${bEnd}`,
      'iu',
    ),
  },
  {
    canonical: 'Measles',
    pattern: new RegExp(`${bStart}(?:measles(?:\\s*rubella)?|मीजल्स|मीझल्स|मिझल्स|गोवर|खसरा)${bEnd}`, 'iu'),
  },
  {
    canonical: 'MR',
    pattern: new RegExp(`${bStart}(?:mr\\s*(?:vaccine|1|2)?|m[\\s.-]+r|एमआर|एम\\s*आर)${bEnd}`, 'iu'),
  },
  {
    canonical: 'TT1',
    pattern: new RegExp(
      `${bStart}(?:tt[\\s-]*(?:1|one|first|ek|एक|वन)|td[\\s-]*1|टीटी[\\s-]*(?:1|एक|वन)|टी\\s*टी[\\s-]*(?:1|एक))${bEnd}`,
      'iu',
    ),
  },
  {
    canonical: 'TT2',
    pattern: new RegExp(
      `${bStart}(?:tt[\\s-]*(?:2|two|second|do|don|दो|दोन|टू)|td[\\s-]*2|टीटी[\\s-]*(?:2|दो|दोन|टू)|टी\\s*टी[\\s-]*(?:2|दो|दोन))${bEnd}`,
      'iu',
    ),
  },
  {
    canonical: 'TT',
    pattern: new RegExp(`${bStart}(?:tt|t[\\s.-]+t|td|tetanus(?:\\s+toxoid)?|टीटी|टी\\s*टी|टिटनेस|धनुर्वात)${bEnd}`, 'iu'),
  },
];

const IFA_PATTERN = new RegExp(
  `${bStart}(?:ifa(?:\\s+tablets?)?|iron\\s*(?:and\\s*)?folic(?:\\s+acid)?|आयरन\\s*की\\s*गोली|आयरन\\s*गोळ्या|आयएफए|आइएफए)${bEnd}`,
  'iu',
);

const NOT_CAPTURED_VAX_PATTERN = new RegExp(
  `${bStart}(?:not\\s+captured|not\\s+checked|unknown|card\\s+missing|दर्ज\\s*नहीं|माहिती\\s*नाही|नोंदलेले\\s*नाही|पता\\s*नहीं)${bEnd}`,
  'iu',
);

const NONE_DUE_VAX_PATTERN = new RegExp(
  `${bStart}(?:none\\s*(?:due|reported)?|no\\s+(?:vaccines?|vaccinations?)\\s*(?:due)?|nil|nothing|nahi|नहीं|कोई\\s*नहीं|कुछ\\s*नहीं|नाही|काही\\s*नाही|कोणतीही\\s*नाही|लस\\s*काही\\s*नाही|लस\\s*नाही|टीके\\s*कुछ\\s*नहीं|टीका\\s*नहीं)${bEnd}`,
  'iu',
);

const VAX_CUE_PATTERN =
  /(?:vaccinations?|vaccines?|देय\s*टीके|देय\s*लसी|टीका(?!करण)|लस(?!ीकरण))\s*(?:due|pending)?\s*(?:are|is|due|हैं|है|आहेत|आहे|:)?\s*/iu;

const CLAUSE_STOP_PATTERN =
  /(?:(?<![a-zA-Z0-9_\u0900-\u097F])(?:next\s+visit|pudhil\s+bhet|pudhil\s+visit|weight|वजन|अगली\s+मुलाकात|अगली\s+भेट|पुढील\s+भेट|ifa)(?![a-zA-Z0-9_\u0900-\u097F])|[.!?])/iu;

export function formatVaccineList(vaccines: CanonicalVaccine[]): string {
  if (vaccines.length === 0) return 'None reported';
  if (vaccines.length === 1) return vaccines[0];
  if (vaccines.length === 2) return `${vaccines[0]} and ${vaccines[1]}`;
  return vaccines.join(', ');
}

function scanClosedVaccines(text: string): CanonicalVaccine[] {
  const hits: Array<{ canonical: CanonicalVaccine; index: number }> = [];
  for (const entry of VACCINE_PATTERNS) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    // Skip generic TT if TT1 or TT2 already matched
    if (entry.canonical === 'TT' && hits.some((h) => h.canonical === 'TT1' || h.canonical === 'TT2')) {
      continue;
    }
    if (!hits.some((h) => h.canonical === entry.canonical)) {
      hits.push({ canonical: entry.canonical, index: match.index });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits.map((h) => h.canonical);
}

/**
 * Extracts PS1 "Vaccinations due" using the closed vaccine lexicon across Roman, Devanagari,
 * and spoken variants, cleanly separating "none due", "not captured", and IFA supplements.
 */
export function extractVaccinationStatus(rawText: string): VaccinationExtraction {
  const t = normalizeTranscript(rawText);
  const ifaMentioned = IFA_PATTERN.test(t);

  // 1. Inspect explicit vaccination clause first if present
  const cueMatch = VAX_CUE_PATTERN.exec(t);
  const clause = cueMatch
    ? t.slice(cueMatch.index + cueMatch[0].length).split(CLAUSE_STOP_PATTERN)[0].trim()
    : '';

  if (clause) {
    if (NOT_CAPTURED_VAX_PATTERN.test(clause)) {
      return { value: 'Not captured', status: 'not_captured', vaccines: [], ifaMentioned };
    }
    const clauseVaccines = scanClosedVaccines(clause);
    if (clauseVaccines.length > 0) {
      return {
        value: formatVaccineList(clauseVaccines),
        status: 'vaccines',
        vaccines: clauseVaccines,
        ifaMentioned,
      };
    }
    if (NONE_DUE_VAX_PATTERN.test(clause)) {
      return { value: 'None reported', status: 'none_due', vaccines: [], ifaMentioned };
    }
  }

  // 2. Scan full utterance for closed-list vaccines (handles ASR-garbled cue prefixes like "देल्सी TT do" / "देल असे मीजल्स")
  // Exclude explicit negation right before/after a vaccine name (e.g. "no BCG due")
  const fullVaccines = scanClosedVaccines(t);
  if (fullVaccines.length > 0 && !NONE_DUE_VAX_PATTERN.test(clause)) {
    return {
      value: formatVaccineList(fullVaccines),
      status: 'vaccines',
      vaccines: fullVaccines,
      ifaMentioned,
    };
  }

  // 3. Explicit "none due" anywhere (e.g. "लस काही नाही", "no vaccines due")
  if (NONE_DUE_VAX_PATTERN.test(t)) {
    return { value: 'None reported', status: 'none_due', vaccines: [], ifaMentioned };
  }

  // 4. Explicit "not captured" mention
  if (NOT_CAPTURED_VAX_PATTERN.test(t)) {
    return { value: 'Not captured', status: 'not_captured', vaccines: [], ifaMentioned };
  }

  // 5. No vaccination mention in transcript -> status is not_captured, display value remains 'None reported' for PS1 default
  return { value: 'None reported', status: 'not_captured', vaccines: [], ifaMentioned };
}

/** Canonical comparison helper so synonyms like "Polio" and "OPV" compare equal in regression checks. */
export function canonicalizeVaccinationField(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /^(?:none|none reported|none due|not captured)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'not captured' ? 'Not captured' : 'None reported';
  }
  const found = scanClosedVaccines(normalizeTranscript(trimmed));
  return found.length > 0 ? formatVaccineList(found) : trimmed;
}
