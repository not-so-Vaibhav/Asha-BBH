/**
 * Transcript normalization for Gnani Prisma v3.0 output across English, Hindi, Marathi, and code-mix.
 * Keeps original text intact elsewhere; returns normalized text for deterministic extraction,
 * corrections, date parsing, and danger-sign matching.
 */

const DEVANAGARI_DIGITS: Record<string, string> = Object.fromEntries(
  [...'०१२३४५६७८९'].map((digit, index) => [digit, String(index)]),
);

const NUQTA_MAP: Record<string, string> = {
  'ज़': 'ज',
  'फ़': 'फ',
  'क़': 'क',
  'ख़': 'ख',
  'ग़': 'ग',
  'ड़': 'ड',
  'ढ़': 'ढ',
  'य़': 'य',
  '\u093C': '', // combining Devanagari nuqta
};

const SPOKEN_DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  शून्य: '0', शून्या: '0', जीरो: '0', एक: '1', दो: '2', दोन: '2', तीन: '3', चार: '4', पांच: '5', पाच: '5',
  छह: '6', सहा: '6', सात: '7', आठ: '8', नौ: '9', नऊ: '9',
};

const DEVANAGARI_LETTER_MAP: Record<string, string> = {
  ए: 'A', बी: 'B', सी: 'C', डी: 'D', ई: 'E', जी: 'G', एच: 'H', एम: 'M', एन: 'N', ओ: 'O', पी: 'P',
  टी: 'T', वी: 'V', व्ही: 'V', वाय: 'Y', वाई: 'Y',
};

export function toWesternDigits(value: string): string {
  return value.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);
}

export function stripNuqta(value: string): string {
  return value.normalize('NFC').replace(/ज़|फ़|क़|ख़|ग़|ड़|ढ़|य़|\u093C/g, (ch) => NUQTA_MAP[ch] ?? ch);
}

/**
 * Normalizes Devanagari Unicode variants:
 * - NFC canonical composition
 * - Removes zero-width joiners / non-joiners / soft hyphens (U+200B..U+200D, U+FEFF, U+00AD)
 * - Chandrabindu (ँ) -> Anusvara (ं) equivalence (साँस === सांस, हथेलियाँ === हथेलियां)
 * - Nukta removal (ज़ -> ज, फ़ -> फ, ड़ -> ड, etc.)
 * - Common half-nasal conjuncts -> anusvara (म्ब -> ंब, ण्ड -> ंड, न्द -> ंद, न्त -> ंत, ङ् -> ं, ञ्च -> ंच)
 */
export function normalizeDevanagariUnicode(value: string): string {
  let out = value
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\u0901/g, '\u0902'); // chandrabindu -> anusvara

  out = stripNuqta(out);

  // Common half-nasal conjunct spellings -> standard anusvara form
  out = out
    .replace(/म्([पफबभ])/gu, 'ं$1')
    .replace(/ण्([टठडढ])/gu, 'ं$1')
    .replace(/न्([तथदध])/gu, 'ं$1')
    .replace(/ङ्([कखगघ])/gu, 'ं$1')
    .replace(/ञ्([चछजझ])/gu, 'ं$1')
    .replace(/रक्तस्त्राव/gu, 'रक्तस्राव');

  return out;
}

function normalizeSpokenBeneficiaryIds(text: string): string {
  const bStart = '(?<![a-zA-Z0-9_\\u0900-\\u097F])';
  const bEnd = '(?![a-zA-Z0-9_\\u0900-\\u097F])';
  const digitWordPat = Object.keys(SPOKEN_DIGIT_WORDS).sort((a, b) => b.length - a.length).join('|');
  const benPrefix = '(?:b[\\s.-]*e[\\s.-]*n|ben|ban|bin|बेन|बैन|बिन|बॅन|मॅन|पिन|बी\\s*ई\\s*एन)';

  // Spoken "BEN एक हजार चार" / "बॅन एक हजार एक" -> BEN-1004 / BEN-1001
  let out = text.replace(
    new RegExp(`${bStart}${benPrefix}\\s+(?:1|one|एक)\\s+(?:thousand|हजार)\\s+(${digitWordPat}|\\d{1,2})${bEnd}`, 'giu'),
    (_m, last) => {
      const d = SPOKEN_DIGIT_WORDS[last.toLowerCase()] ?? last;
      const n = Number(d);
      if (Number.isInteger(n) && n >= 0 && n <= 99) {
        return `BEN-${1000 + n}`;
      }
      return _m;
    },
  );

  // Spoken 4 single digits after BEN / ID prefix: e.g. "पिन एक शून्य शून्य चार" -> "BEN-1004"
  out = out.replace(
    new RegExp(
      `${bStart}${benPrefix}\\s+(${digitWordPat}|\\d)\\s+(${digitWordPat}|\\d)\\s+(${digitWordPat}|\\d)\\s+(${digitWordPat}|\\d)${bEnd}`,
      'giu',
    ),
    (_m, d1, d2, d3, d4) => {
      const digits = [d1, d2, d3, d4].map((tok) => SPOKEN_DIGIT_WORDS[tok.toLowerCase()] ?? tok).join('');
      return `BEN-${digits}`;
    },
  );

  // Direct numeric BEN-xxxx variants: "BEN 1001", "B E N 1001", "BAN1002", "बेन 1001", "बॅन 1004"
  out = out.replace(
    new RegExp(`${bStart}${benPrefix}[\\s-]*(\\d{3,5})${bEnd}`, 'giu'),
    'BEN-$1',
  );

  return out;
}

function normalizeSpokenDevanagariAcronyms(text: string): string {
  const letterPat = Object.keys(DEVANAGARI_LETTER_MAP).sort((a, b) => b.length - a.length).join('|');
  const bStart = '(?<![a-zA-Z0-9_\\u0900-\\u097F])';
  const bEnd = '(?![a-zA-Z0-9_\\u0900-\\u097F])';
  // Convert sequences of 3-4 spoken Devanagari English letter names (e.g. "ए एम सी" -> "AMC", "एच बी एन सी" -> "HBNC")
  const seqRe = new RegExp(`${bStart}(${letterPat})(?:\\s*\\.?\\s*(${letterPat})){2,3}${bEnd}`, 'gu');
  return text.replace(seqRe, (match) => {
    const tokens = match.replace(/\./g, ' ').trim().split(/\s+/);
    if (tokens.length < 3 || tokens.length > 4) return match;
    const mapped = tokens.map((tok) => DEVANAGARI_LETTER_MAP[tok]);
    if (mapped.some((m) => !m)) return match;
    return mapped.join('');
  });
}

export function normalizeTranscript(raw: string): string {
  let text = normalizeDevanagariUnicode(toWesternDigits(raw));

  // Normalize common whitespace and Devanagari danda punctuation
  text = text.replace(/।/g, '. ').replace(/\s+/g, ' ').trim();

  // Normalize thousands commas inside 4-digit IDs (e.g. "1,003" -> "1003")
  text = text.replace(/\b1,0(\d{2})\b/g, '10$1');

  // Normalize spoken & numeric Beneficiary IDs
  text = normalizeSpokenBeneficiaryIds(text);

  // Normalize spoken Devanagari letter sequences into Latin acronyms (feeds explicit + context visit-type & vaccine matching)
  text = normalizeSpokenDevanagariAcronyms(text);

  // Normalize spoken visit-type and vaccine acronyms (including Devanagari joined & hyphenated Prisma output)
  const bStart = '(?<![a-zA-Z0-9_\\u0900-\\u097F])';
  const bEnd = '(?![a-zA-Z0-9_\\u0900-\\u097F])';
  text = text.replace(new RegExp(`${bStart}(?:a[\\s.-]*n[\\s.-]*c|एएनसी)${bEnd}`, 'giu'), 'ANC');
  text = text.replace(new RegExp(`${bStart}(?:p[\\s.-]*n[\\s.-]*c|पीएनसी)${bEnd}`, 'giu'), 'PNC');
  text = text.replace(new RegExp(`${bStart}(?:h[\\s.-]*b[\\s.-]*n[\\s.-]*c|एचबीएनसी)${bEnd}`, 'giu'), 'HBNC');
  text = text.replace(new RegExp(`${bStart}(?:h[\\s.-]*b[\\s.-]*y[\\s.-]*c|एचबीवायसी|एचबीवाईसी)${bEnd}`, 'giu'), 'HBYC');
  text = text.replace(/\bO[\s.-]+P[\s.-]+V\b/gi, 'OPV');
  text = text.replace(/\bD[\s.-]+P[\s.-]+T\b/gi, 'DPT');
  text = text.replace(/\bB[\s.-]+C[\s.-]+G\b/gi, 'BCG');
  text = text.replace(/\bT[\s.-]+T[\s.-]*([12])\b/gi, 'TT$1');

  // Normalize weight units & common STT typos (kgl, kgs, kilo, kilos, किलोग्राम, किलो)
  text = text.replace(/\b(?:kilograms?|kilos?|kgs?|kgl)\b/gi, 'kg');
  text = text.replace(/(?:किलोग्राम|किलो|कि\.?\s*ग्रा\.?|कि\.?\s*ग्रॅ\.?)/gu, 'kg');

  // Normalize common Hindi/Marathi spelling variants
  text = text.replace(/टिकाकरण/gu, 'टीकाकरण');
  text = text.replace(/अक्तूबर/gu, 'अक्टूबर');
  text = text.replace(/आयडी|आईडी|आइडी/gu, 'ID');

  return text.replace(/\s+/g, ' ').trim();
}
