import type { BeneficiaryKind, Language, Rule } from './types';
import { normalizeTranscript } from './normalize';

const src = 'Predefined danger sign · MoHFW guideline';
const w: Record<Language, string> = {
  en: 'A predefined danger sign was reported. Referral support is recommended.',
  hi: 'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
  mr: 'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
};

export const ruleCategories: Record<string, Record<Language, string>> = {
  'PREG-01': { en: 'Bleeding during pregnancy', hi: 'गर्भावस्था में रक्तस्राव', mr: 'गर्भधारणेदरम्यान रक्तस्राव' },
  'PREG-02': { en: 'High fever during pregnancy', hi: 'गर्भावस्था में तेज बुखार', mr: 'गर्भधारणेदरम्यान जास्त ताप' },
  'NB-01': { en: 'Fever or hot to touch', hi: 'बुखार या छूने पर गर्म', mr: 'ताप किंवा अंग गरम' },
  'NB-02': { en: 'Cold to touch', hi: 'छूने पर ठंडा', mr: 'अंग थंड पडणे' },
  'NB-03': { en: 'Not feeding', hi: 'दूध नहीं पी रहा', mr: 'दूध पीत नाही' },
  'NB-04': { en: 'Fast or difficult breathing', hi: 'तेज या कठिन सांस', mr: 'जलद किंवा कठीण श्वास' },
  'NB-05': { en: 'Other newborn danger sign', hi: 'अन्य नवजात खतरे का संकेत', mr: 'इतर नवजात धोक्याचे लक्षण' },
};

export function localizedRuleCategory(ruleId: string, fallback: string, language: Language): string {
  return ruleCategories[ruleId]?.[language] ?? fallback;
}

/**
 * Unreviewed Devanagari-transliterated English candidates observed or expected from
 * Prisma v3.0 format=codemix are stored strictly under `pending_review` and are NOT
 * active in alert matching until reviewed by a native Hindi/Marathi speaker.
 * See `rules/variants_candidates.md` for the review table.
 */
export const rules: Rule[] = [
  {
    id: 'PREG-01',
    category: 'Bleeding during pregnancy',
    appliesTo: ['Pregnant'],
    patterns: {
      en: ['bleeding', 'vaginal bleeding', 'spotting with blood'],
      hi: ['खून आना', 'खून आ रहा', 'खून बह रहा', 'रक्तस्राव', 'ब्लीडिंग'],
      mr: ['रक्तस्राव', 'रक्तस्राव होत', 'रक्त जाणे', 'रक्त जात आहे', 'ब्लीडिंग'],
      mix: ['bleeding hot', 'bleeding aahe', 'khoon aa raha', 'rakta jat aahe'],
    },
    pending_review: {
      hi: ['वजाइनल ब्लीडिंग', 'स्पॉटिंग', 'ब्लड आ रहा'],
      mr: ['व्हजायनल ब्लीडिंग', 'स्पॉटिंग', 'ब्लड येत आहे'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
  {
    id: 'PREG-02',
    category: 'High fever during pregnancy',
    appliesTo: ['Pregnant'],
    patterns: {
      en: ['high fever', 'very high temperature', 'severe fever'],
      hi: ['तेज बुखार', 'बहुत तेज बुखार', 'ज्यादा बुखार'],
      mr: ['जास्त ताप', 'खूप ताप', 'तीव्र ताप'],
      mix: ['high fever', 'khup tap', 'tej bukhar', 'tez bukhar', 'jast tap'],
    },
    pending_review: {
      hi: ['हाई फीवर', 'हाय फीवर', 'बहुत फीवर', 'हाई टेम्परेचर'],
      mr: ['हाय फिव्हर', 'हाय फीवर', 'जास्त फिव्हर', 'हाय टेम्परेचर'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
  {
    id: 'NB-01',
    category: 'Fever or hot to touch',
    appliesTo: ['Newborn'],
    patterns: {
      en: ['fever', 'hot to touch', 'feels hot', 'body is hot'],
      hi: ['बुखार', 'छूने पर गर्म', 'शरीर गर्म', 'बदन गर्म'],
      mr: ['ताप', 'अंग गरम', 'शरीर गरम'],
      mix: ['fever', 'hot aahe', 'bukhar hai', 'ang garam'],
    },
    pending_review: {
      hi: ['फीवर', 'फिवर', 'हॉट टू टच', 'बॉडी हॉट'],
      mr: ['फिव्हर', 'फीवर', 'हॉट टू टच', 'बॉडी हॉट'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
  {
    id: 'NB-02',
    category: 'Cold to touch',
    appliesTo: ['Newborn'],
    patterns: {
      en: ['cold to touch', 'feels cold', 'body is cold', 'hypothermia'],
      hi: ['ठंडा', 'छूने पर ठंडा', 'शरीर ठंडा', 'बदन ठंडा'],
      mr: ['थंड', 'अंग थंड', 'शरीर थंड'],
      mix: ['cold aahe', 'cold to touch', 'thanda lag raha', 'ang thand'],
    },
    pending_review: {
      hi: ['कोल्ड टू टच', 'बॉडी कोल्ड', 'हाइपोथर्मिया'],
      mr: ['कोल्ड टू टच', 'बॉडी कोल्ड', 'हायपोथर्मिया'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
  {
    id: 'NB-03',
    category: 'Not feeding',
    appliesTo: ['Newborn'],
    patterns: {
      en: ['not feeding', 'refuses feed', 'refusing feed', 'unable to feed', 'not taking milk', 'not drinking milk'],
      hi: ['दूध नहीं पी', 'दूध नहीं पी रहा', 'दूध नहीं पी रही', 'स्तनपान नहीं'],
      mr: ['दूध पीत नाही', 'दूध घेत नाही', 'दूध पित नाही'],
      mix: ['doodh pit nahi', 'doodh nahi pi', 'dudh pit nahi', 'feed nahi', 'milk nahi'],
    },
    pending_review: {
      hi: ['नॉट फीडिंग', 'फीडिंग नहीं', 'मिल्क नहीं पी रहा'],
      mr: ['नॉट फीडिंग', 'फीडिंग नाही', 'मिल्क पीत नाही'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
  {
    id: 'NB-04',
    category: 'Fast or difficult breathing',
    appliesTo: ['Newborn'],
    patterns: {
      en: ['fast breathing', 'rapid breathing', 'difficult breathing', 'difficulty breathing', 'trouble breathing', 'chest indrawing'],
      hi: ['तेज सांस', 'सांस लेने में कठिनाई', 'सांस लेने में तकलीफ', 'सांस फूल'],
      mr: ['जलद श्वास', 'श्वास घ्यायला त्रास', 'श्वास घेण्यास त्रास', 'दम लागणे'],
      mix: ['fast breathing', 'shwas ghyayla tras', 'tez saans', 'saans lene mein takleef'],
    },
    pending_review: {
      hi: ['फास्ट ब्रीदिंग', 'डिफिकल्ट ब्रीदिंग', 'ब्रीदिंग प्रॉब्लम', 'चेस्ट इनड्रॉइंग'],
      mr: ['फास्ट ब्रीदिंग', 'डिफिकल्ट ब्रीदिंग', 'ब्रीदिंग त्रास', 'चेस्ट इनड्रॉइंग'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
  {
    id: 'NB-05',
    category: 'Other newborn danger sign',
    appliesTo: ['Newborn'],
    patterns: {
      en: ['weak cry', 'limp', 'lethargic', 'convulsions', 'fits', 'seizures', 'yellow palms', 'yellow soles', 'yellow palms and soles'],
      hi: ['कमजोर रोना', 'सुस्त', 'दौरे', 'झटके', 'पीली हथेलियां', 'पीले तलवे'],
      mr: ['कमकुवत रडणे', 'निस्तेज', 'आकडी', 'झटके', 'पिवळे तळहात', 'पिवळे तळवे'],
      mix: ['weak cry', 'limp', 'convulsions', 'yellow palms', 'yellow soles', 'daure', 'aakdi'],
    },
    pending_review: {
      hi: ['वीक क्राय', 'लिंप', 'लेथार्जिक', 'कन्वल्शन', 'फिट्स', 'सीजर', 'येलो पाम्स', 'येलो सोल्स'],
      mr: ['वीक क्राय', 'लिंप', 'लेथार्जिक', 'कन्व्हल्शन्स', 'फिट्स', 'सीझर', 'येलो पाम्स', 'येलो सोल्स'],
    },
    source: src,
    version: 'PS1-demo-3',
    wording: w,
  },
];

export type DangerMatch = { rule: Rule; phrase: string; needsReview: boolean; fuzzy?: boolean };

const ambiguous = /(?:\bmaybe\b|\bpossibly\b|\bnot sure\b|\bunclear\b|\bmight be\b|\bperhaps\b|शायद|कदाचित|बहुधा|नक्की नाही|पता नहीं)/iu;
const clearPrefix = /(?:\bno\s+(?:signs?\s+of\s+)?|\bnot\s+(?:having\s+)?|\bwithout\s+|\bnever\s+had\s+|\bnahi\s+|\bnas(?:un|le)?\s+|नहीं\s*|नही\s*|नाही\s*)$/iu;
const clearSuffix = /^\s*(?:nahi(?:\s+(?:hai|aahe|hota|hoti))?|nasun|नहीं(?:\s+(?:है|हैं|आ रहा|हो रहा|आया\s+है|आई\s+है|हुआ\s+है|हुई\s+है))?|नाहीत?(?:\s+(?:आहे|आहेत|होत))?)(?![a-zA-Z0-9_\u0900-\u097F])/iu;
const resolvedPastAfter = /^[^.!?]{0,40}\b(?:last\s+week|yesterday|earlier|previously|days?\s+ago)\b[^.!?]{0,30}\b(?:now\s+(?:fine|normal|okay|ok|better|well|resolved)|no\s+longer|all\s+clear|is\s+fine)\b/iu;
const resolvedPastIndicAfter = /^[^.!?]{0,40}(?:था|थी|होता|होती)[^.!?]{0,30}(?:अब\s*(?:ठीक|नॉर्मल|सामान्य)|आता\s*(?:बरे|ठीक|नॉर्मल|सामान्य))/iu;

const FUZZY_EXCLUDED_TOKENS = new Set([
  'leading', 'reading', 'heading', 'needing', 'seeding', 'wedding', 'breeding', 'feeding', 'feeling',
  'never', 'ever', 'lever', 'sever', 'clever', 'cover', 'over', 'river', 'liver',
  'nahi', 'नहीं', 'नाही', 'normal', 'healthy',
]);

type WordSpan = { word: string; start: number; end: number };

function tokenizeWithSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  const re = /[a-z0-9\u0900-\u097F]+/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

function isDevanagari(word: string): boolean {
  return /[\u0900-\u097F]/.test(word);
}

function levenshteinBounded(a: string, b: string, maxDist = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    let rowMin = dp[0];
    for (let i = 1; i <= a.length; i += 1) {
      const temp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
      if (dp[i] < rowMin) rowMin = dp[i];
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[a.length];
}

function wordMatchesControlled(patternWord: string, candidateWord: string): { matched: boolean; fuzzy: boolean } {
  if (patternWord === candidateWord) return { matched: true, fuzzy: false };
  // Controlled fuzzy matching: strictly edit distance 1 for words of 5 or more characters,
  // same script only, and never matching excluded common non-danger words.
  if (patternWord.length < 5 || candidateWord.length < 4) return { matched: false, fuzzy: false };
  if (isDevanagari(patternWord) !== isDevanagari(candidateWord)) return { matched: false, fuzzy: false };
  if (FUZZY_EXCLUDED_TOKENS.has(candidateWord)) return { matched: false, fuzzy: false };
  if (levenshteinBounded(patternWord, candidateWord, 1) <= 1) {
    return { matched: true, fuzzy: true };
  }
  return { matched: false, fuzzy: false };
}

/**
 * Attempts controlled fuzzy phrase matching against tokenized transcript spans.
 * Also allows a single >=5-char lexicon word to match two adjacent transcript tokens joined
 * together (handles ASR compound-word splits like "तळहात" -> "तण हात") at edit distance <= 1.
 */
function findControlledFuzzySpan(
  normalizedPhrase: string,
  tSpans: WordSpan[],
): { start: number; end: number; fuzzy: boolean } | null {
  const pWords = normalizedPhrase.match(/[a-z0-9\u0900-\u097F]+/giu);
  if (!pWords || !pWords.length || !tSpans.length) return null;
  if (!pWords.some((w) => w.length >= 5)) return null;

  for (let startIdx = 0; startIdx < tSpans.length; startIdx += 1) {
    let tIdx = startIdx;
    let usedFuzzy = false;
    let ok = true;

    for (let pIdx = 0; pIdx < pWords.length; pIdx += 1) {
      if (tIdx >= tSpans.length) {
        ok = false;
        break;
      }
      const pw = pWords[pIdx];
      const single = wordMatchesControlled(pw, tSpans[tIdx].word);
      if (single.matched) {
        if (single.fuzzy) usedFuzzy = true;
        tIdx += 1;
        continue;
      }
      // Try joining two adjacent transcript tokens for a >=5-char compound lexicon word
      if (pw.length >= 5 && tIdx + 1 < tSpans.length) {
        const joined = tSpans[tIdx].word + tSpans[tIdx + 1].word;
        const pair = wordMatchesControlled(pw, joined);
        if (pair.matched) {
          usedFuzzy = true;
          tIdx += 2;
          continue;
        }
      }
      ok = false;
      break;
    }

    if (ok && usedFuzzy) {
      return {
        start: tSpans[startIdx].start,
        end: tSpans[tIdx - 1].end,
        fuzzy: true,
      };
    }
  }
  return null;
}

function isClearNegation(text: string, start: number, end: number, id: string) {
  const before = text.slice(Math.max(0, start - 48), start);
  const after = text.slice(end, Math.min(text.length, end + 80));
  if (ambiguous.test(before) || ambiguous.test(after.slice(0, 36))) return false;
  if (resolvedPastAfter.test(after) || resolvedPastIndicAfter.test(after)) return true;
  if (id === 'NB-03') {
    return (
      /\bno\s+(?:signs?\s+of\s+)?(?:not feeding|feed refusal)\b/i.test(before) ||
      /\bfeeding\s+(?:well|normally)\b/i.test(after.slice(0, 36))
    );
  }
  return clearPrefix.test(before) || clearSuffix.test(after.slice(0, 36));
}

export function scanDangerSigns(text: string, kind: BeneficiaryKind, _language: Language = 'en', final = true): DangerMatch[] {
  const t = normalizeTranscript(text).toLowerCase();
  const tSpans = tokenizeWithSpans(t);
  const results: DangerMatch[] = [];
  for (const rule of rules) {
    if (!rule.appliesTo.includes(kind)) continue;
    let found: DangerMatch | undefined;
    const phrases = [...new Set(Object.values(rule.patterns).flat())].sort((a, b) => b.length - a.length);

    // Pass 1: exact normalized substring match
    for (const phrase of phrases) {
      const normalizedPhrase = normalizeTranscript(phrase).toLowerCase();
      const index = t.indexOf(normalizedPhrase);
      if (index < 0) continue;
      const end = index + normalizedPhrase.length;
      if (!final && end === t.length && !clearPrefix.test(t.slice(Math.max(0, index - 48), index))) continue;
      if (isClearNegation(t, index, end, rule.id)) continue;
      found = {
        rule,
        phrase,
        needsReview: ambiguous.test(t.slice(Math.max(0, index - 48), Math.min(t.length, end + 36))),
        fuzzy: false,
      };
      break;
    }

    // Pass 2: controlled fuzzy matching (edit distance 1 for >=5-char lexicon words only)
    if (!found) {
      for (const phrase of phrases) {
        const normalizedPhrase = normalizeTranscript(phrase).toLowerCase();
        const span = findControlledFuzzySpan(normalizedPhrase, tSpans);
        if (!span) continue;
        if (!final && span.end === t.length && !clearPrefix.test(t.slice(Math.max(0, span.start - 48), span.start))) continue;
        if (isClearNegation(t, span.start, span.end, rule.id)) continue;
        found = {
          rule,
          phrase,
          needsReview: ambiguous.test(t.slice(Math.max(0, span.start - 48), Math.min(t.length, span.end + 36))),
          fuzzy: true,
        };
        break;
      }
    }

    if (found) results.push(found);
  }
  return results;
}

export function detectDanger(text: string, kind: BeneficiaryKind, _language: Language = 'en', final = true): DangerMatch | null {
  return scanDangerSigns(text, kind, _language, final)[0] ?? null;
}
