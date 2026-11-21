import { copy, extraCopy } from '../data/i18n';
import { beneficiaries } from '../data/seed';
import type { Beneficiary, Language, VisitFields, VisitType } from '../domain/types';

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

export function formattedDate(value: string, language: Language = 'en'): string {
  if (!value || value === 'Not set') return value;
  const d = new Date(value + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
  });
}

export function displayValue(value: string, language: Language): string {
  return value === 'Not captured'
    ? copy[language].notCaptured
    : value === 'None reported'
      ? copy[language].noneReported
      : value === 'Not set'
        ? copy[language].notSet
        : value;
}

export function localizeVisitType(visitType: VisitType, language: Language): string {
  return extraCopy[language][visitType.toLowerCase() as keyof (typeof extraCopy)['en']];
}

export function recordText(
  person: Beneficiary,
  fields: VisitFields,
  language: Language,
  visitTypeFromContext = false,
): string {
  const visitType = localizeVisitType(fields.visitType, language);
  const weight = displayValue(fields.weight, language);
  const vax = displayValue(fields.vaccinationsDue, language);
  const nextDate = displayValue(formattedDate(fields.nextVisitDate, language), language);
  const cue = visitTypeFromContext ? ` ${extraCopy[language].contextReadbackCue}` : '';
  if (language === 'hi') {
    return `${person.name}, ${fields.beneficiaryId}। ${visitType}, ${weight}। टीके: ${vax}। अगली भेट: ${nextDate}।${cue}`;
  }
  if (language === 'mr') {
    return `${person.name}, ${fields.beneficiaryId}. ${visitType}, ${weight}. लसी: ${vax}. पुढील भेट: ${nextDate}.${cue}`;
  }
  return `${person.name}, ${fields.beneficiaryId}. ${visitType}, ${weight}. Vaccines: ${vax}. Next: ${nextDate}.${cue}`;
}

export type ReadbackTemplateSpec = {
  id: string;
  beneficiaryId: string;
  fields: VisitFields;
  visitTypeFromContext?: boolean;
  priority?: boolean;
};

/**
 * High-likelihood visit read-back templates (visit-type + weight + next-visit where values are known)
 * covering all seeded demo beneficiaries, all 6 visit types, both sample corrections, and back-from-alert drafts.
 */
export const PREGEN_READBACK_TEMPLATES: ReadbackTemplateSpec[] = [
  {
    id: 'anc-55-20nov',
    beneficiaryId: 'BEN-1001',
    fields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' },
    priority: true,
  },
  {
    id: 'anc-56-20nov',
    beneficiaryId: 'BEN-1001',
    fields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' },
    priority: true,
  },
  {
    id: 'anc-56-22nov',
    beneficiaryId: 'BEN-1001',
    fields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' },
    priority: true,
  },
  {
    id: 'anc-55-22nov',
    beneficiaryId: 'BEN-1001',
    fields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' },
  },
  {
    id: 'gen-sunita-empty',
    beneficiaryId: 'BEN-1001',
    fields: { beneficiaryId: 'BEN-1001', visitType: 'General', weight: 'Not captured', vaccinationsDue: 'None reported', nextVisitDate: 'Not set' },
    priority: true,
  },
  {
    id: 'hbnc-3-2-18nov',
    beneficiaryId: 'BEN-1002',
    fields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.2 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-18' },
  },
  {
    id: 'gen-baby-empty',
    beneficiaryId: 'BEN-1002',
    fields: { beneficiaryId: 'BEN-1002', visitType: 'General', weight: 'Not captured', vaccinationsDue: 'None reported', nextVisitDate: 'Not set' },
  },
  {
    id: 'hbyc-9-25nov',
    beneficiaryId: 'BEN-1003',
    fields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9 kg', vaccinationsDue: 'OPV', nextVisitDate: '2026-11-25' },
  },
  {
    id: 'pnc-52-22nov',
    beneficiaryId: 'BEN-1004',
    fields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '52 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' },
  },
  {
    id: 'imm-12-28nov',
    beneficiaryId: 'BEN-1005',
    fields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '12 kg', vaccinationsDue: 'DPT', nextVisitDate: '2026-11-28' },
  },
];

function normalizeReadbackLookup(text: string): string {
  return text
    .trim()
    .replace(/[०-९]/g, (ch) => String(DEVANAGARI_DIGITS.indexOf(ch)))
    .replace(/\s+/g, ' ');
}

export type PregenReadbackEntry = {
  id: string;
  language: Language;
  text: string;
  url: string;
  priority: boolean;
};

let cachedEntries: PregenReadbackEntry[] | null = null;
let cachedIndex: Map<string, PregenReadbackEntry> | null = null;

function ensureIndex() {
  if (cachedEntries && cachedIndex) return;
  const entries: PregenReadbackEntry[] = [];
  const index = new Map<string, PregenReadbackEntry>();
  const languages: Language[] = ['en', 'hi', 'mr'];

  for (const spec of PREGEN_READBACK_TEMPLATES) {
    const person = beneficiaries.find((b) => b.id === spec.beneficiaryId);
    if (!person) continue;
    for (const language of languages) {
      const text = recordText(person, spec.fields, language, Boolean(spec.visitTypeFromContext));
      const url = `/audio/readback/${spec.id}-${language}.wav`;
      const entry: PregenReadbackEntry = {
        id: spec.id,
        language,
        text,
        url,
        priority: Boolean(spec.priority),
      };
      entries.push(entry);
      index.set(`${language}:${normalizeReadbackLookup(text)}`, entry);
    }
  }
  cachedEntries = entries;
  cachedIndex = index;
}

export function getPregeneratedReadbackEntries(language?: Language): PregenReadbackEntry[] {
  ensureIndex();
  if (!language) return cachedEntries!;
  return cachedEntries!.filter((e) => e.language === language);
}

export function findPregeneratedReadbackUrl(text: string, language: Language): string | null {
  ensureIndex();
  const entry = cachedIndex!.get(`${language}:${normalizeReadbackLookup(text)}`);
  return entry ? entry.url : null;
}
