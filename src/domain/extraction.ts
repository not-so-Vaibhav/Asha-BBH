import type { BeneficiaryKind, VisitFields, VisitType } from './types';
import { parseVisitDate } from './dateParser';
import { normalizeTranscript } from './normalize';
import { SPOKEN_NUMBER_PHRASE, parseSpokenNumber } from './numbers';
import { extractVaccinationStatus, type VaccinationStatus } from './vaccines';

export { parseSpokenNumber };

export type VisitTypeSource = 'explicit' | 'context' | 'default';

export type DetailedExtraction = {
  fields: VisitFields;
  visitTypeSource: VisitTypeSource;
  vaccinationStatus: VaccinationStatus;
  ifaMentioned: boolean;
};

const KNOWN_NON_VISIT_ACRONYMS = new Set(['BEN', 'OPV', 'DPT', 'BCG', 'TT1', 'TT2', 'PHC', 'ASHA', 'ANM', 'ID', 'KG', 'IFA', 'MR']);

const CONTEXT_VISIT_ACRONYMS: Record<BeneficiaryKind, Array<{ acronym: string; visitType: VisitType; maxDist: number }>> = {
  Newborn: [{ acronym: 'HBNC', visitType: 'HBNC', maxDist: 2 }],
  Pregnant: [
    { acronym: 'ANC', visitType: 'ANC', maxDist: 1 },
    { acronym: 'PNC', visitType: 'PNC', maxDist: 1 },
  ],
  Child: [{ acronym: 'HBYC', visitType: 'HBYC', maxDist: 2 }],
};

const ALL_VISIT_ACRONYMS: Array<{ acronym: string; visitType: VisitType; maxDist: number }> = [
  { acronym: 'ANC', visitType: 'ANC', maxDist: 1 },
  { acronym: 'PNC', visitType: 'PNC', maxDist: 1 },
  { acronym: 'HBNC', visitType: 'HBNC', maxDist: 2 },
  { acronym: 'HBYC', visitType: 'HBYC', maxDist: 2 },
];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const temp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[a.length];
}

function matchVisitAcronymFromSet(
  normalizedText: string,
  candidates: Array<{ acronym: string; visitType: VisitType; maxDist: number }>,
): VisitType | null {
  const acronymTokens = normalizedText.match(/\b[A-Z]{3,4}\b/g) ?? [];
  let best: { visitType: VisitType; distance: number } | null = null;

  for (const token of acronymTokens) {
    if (KNOWN_NON_VISIT_ACRONYMS.has(token)) continue;
    for (const candidate of candidates) {
      if (Math.abs(token.length - candidate.acronym.length) > 1) continue;
      const dist = levenshtein(token, candidate.acronym);
      if (dist > candidate.maxDist) continue;
      if (dist === 2) {
        const sameBoundary =
          token[0] === candidate.acronym[0] &&
          token[token.length - 1] === candidate.acronym[candidate.acronym.length - 1];
        if (!sameBoundary) continue;
      }
      if (!best || dist < best.distance) {
        best = { visitType: candidate.visitType, distance: dist };
      }
    }
  }

  return best?.visitType ?? null;
}

/**
 * Closed-set fuzzy visit-type resolution constrained by beneficiary clinical context.
 * Only inspects uppercase acronym-like tokens (3-4 letters) when NO clear explicit visit type
 * was found, never overrides an explicit mention, and never hard-codes STT mishearings.
 */
function resolveContextualVisitType(normalizedText: string, beneficiaryKind?: BeneficiaryKind): VisitType | null {
  if (!beneficiaryKind) return null;
  const candidates = CONTEXT_VISIT_ACRONYMS[beneficiaryKind];
  if (!candidates?.length) return null;
  return matchVisitAcronymFromSet(normalizedText, candidates);
}

/** Closed-set fuzzy visit-type acronym match used only when an explicit visit-type cue is present in corrections. */
export function resolveExplicitCueFuzzyVisitType(normalizedText: string): VisitType | null {
  return matchVisitAcronymFromSet(normalizedText, ALL_VISIT_ACRONYMS);
}

export function extractWeight(text: string): string {
  const t = normalizeTranscript(text);
  const label = /(?:\bweight\b|वजन)/iu.exec(t);
  if (label) {
    const afterLabel = t.slice(label.index + label[0].length).replace(/^\s*(?:(?:is|was|of|है|आहे|:)\s*)?/iu, '');
    const phrase = SPOKEN_NUMBER_PHRASE.exec(afterLabel)?.[1];
    if (phrase) {
      const value = parseSpokenNumber(phrase);
      if (value && Number(value) > 0 && Number(value) <= 300) return `${value} kg`;
    }
  }
  const kgMatch = t.match(/\b(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgMatch) {
    const value = kgMatch[1].replace(',', '.');
    if (Number(value) > 0 && Number(value) <= 300) return `${value} kg`;
  }
  return '';
}

export function extractDetailed(
  text: string,
  beneficiaryId: string,
  today = '2026-11-13',
  beneficiaryKind?: BeneficiaryKind,
): DetailedExtraction {
  const t = normalizeTranscript(text);
  const idMatch = t.match(/\b(BEN-\d{3,5})\b/i);
  const extractedId = idMatch ? idMatch[1].toUpperCase() : beneficiaryId;

  const explicitVisitTypes: [RegExp, VisitType][] = [
    [/\bANC\b/i, 'ANC'],
    [/\bPNC\b/i, 'PNC'],
    [/\bHBNC\b/i, 'HBNC'],
    [/\bHBYC\b/i, 'HBYC'],
    [/immuni[sz]ation|vaccination|टीकाकरण|लसीकरण/iu, 'Immunisation'],
    [/\bgeneral\b|normal visit|सामान्य/iu, 'General'],
  ];

  const explicitMatch = explicitVisitTypes.find(([pattern]) => pattern.test(t));
  let visitType: VisitType;
  let visitTypeSource: VisitTypeSource;

  if (explicitMatch) {
    visitType = explicitMatch[1];
    visitTypeSource = 'explicit';
  } else {
    const contextual = resolveContextualVisitType(t, beneficiaryKind);
    if (contextual) {
      visitType = contextual;
      visitTypeSource = 'context';
    } else {
      visitType = 'General';
      visitTypeSource = 'default';
    }
  }

  const vax = extractVaccinationStatus(t);

  return {
    fields: {
      beneficiaryId: extractedId,
      visitType,
      weight: extractWeight(t) || 'Not captured',
      vaccinationsDue: vax.value,
      nextVisitDate: parseVisitDate(t, today) || 'Not set',
    },
    visitTypeSource,
    vaccinationStatus: vax.status,
    ifaMentioned: vax.ifaMentioned,
  };
}

export function extract(
  text: string,
  beneficiaryId: string,
  today = '2026-11-13',
  beneficiaryKind?: BeneficiaryKind,
): VisitFields {
  return extractDetailed(text, beneficiaryId, today, beneficiaryKind).fields;
}
