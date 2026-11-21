import type { Correction, VisitFields } from './types';
import { parseVisitDate } from './dateParser';
import { extractWeight, resolveExplicitCueFuzzyVisitType } from './extraction';
import { normalizeTranscript } from './normalize';
import { extractVaccinationStatus } from './vaccines';

export type CorrectionResult = { fields: VisitFields; correction: Correction } | null;

const VISIT_TYPE_CUE = /(?:visit\s*type|मुलाकात\s*का\s*प्रकार|भेटीचा\s*प्रकार)/iu;

export function correctField(
  text: string,
  current: VisitFields,
  now = new Date('2026-11-13T12:00:00'),
): CorrectionResult {
  const t = normalizeTranscript(text);
  let field: keyof VisitFields;
  let value: string;
  let m: RegExpMatchArray | null;

  if ((m = t.match(/(?:beneficiary\s*id|लाभार्थी\s*id|id)\s*(?:is|है|आहे|:)?\s*(BEN-\d+)/iu))) {
    field = 'beneficiaryId';
    value = m[1].toUpperCase();
  } else if (/(?:\bweight\b|वजन)/iu.test(t) && extractWeight(t)) {
    field = 'weight';
    value = extractWeight(t);
  } else if (
    (m = t.match(/(?:vaccinations?|vaccines?|देय\s*टीके|देय\s*लसी|टीका(?!करण)|लस(?!ीकरण))\s*(?:(?:due|pending|are|is|हैं|है|आहेत|आहे)\s*)?:?\s*(.+)/iu))
  ) {
    field = 'vaccinationsDue';
    const vax = extractVaccinationStatus(t);
    if (vax.status === 'vaccines' || vax.status === 'none_due' || vax.value === 'Not captured') {
      value = vax.value;
    } else {
      const raw = m[1].replace(/\s+(?:है|हैं|आहे|आहेत)\s*$/iu, '').replace(/[.!?]+$/, '').trim();
      value = /^(?:none|nil|nothing|nahi|नाही|नहीं|कुछ नहीं|काही नाही)$/iu.test(raw) ? 'None reported' : raw;
    }
  } else if (
    (m = t.match(/(?:next visit|visit date|next date|अगली मुलाकात|अगली भेट|पुढील भेट|pudhil visit|pudhil bhet)\s*(?:date|की तारीख|ची तारीख)?\s*(?:will be|is|on|है|आहे|:)?\s*(.+)/iu))
  ) {
    field = 'nextVisitDate';
    value = parseVisitDate(m[1], now.toISOString().slice(0, 10)) || m[1].replace(/[.!?]+$/, '').trim();
  } else {
    const code = t.match(/\b(ANC|PNC|HBNC|HBYC|immuni[sz]ation|general)\b|टीकाकरण|लसीकरण|सामान्य/iu);
    if (code) {
      field = 'visitType';
      const raw = code[0];
      const match = raw.toUpperCase();
      if (match === 'IMMUNISATION' || match === 'IMMUNIZATION' || raw === 'टीकाकरण' || raw === 'लसीकरण') {
        value = 'Immunisation';
      } else if (match === 'GENERAL' || raw === 'सामान्य') {
        value = 'General';
      } else {
        value = match as VisitFields['visitType'];
      }
    } else if (VISIT_TYPE_CUE.test(t)) {
      const fuzzyType = resolveExplicitCueFuzzyVisitType(t);
      if (!fuzzyType) return null;
      field = 'visitType';
      value = fuzzyType;
    } else {
      // Fallback: bare closed-list vaccine correction without explicit cue (e.g. "OPV and DPT")
      const bareVax = extractVaccinationStatus(t);
      if (bareVax.status === 'vaccines') {
        field = 'vaccinationsDue';
        value = bareVax.value;
      } else {
        return null;
      }
    }
  }

  const oldValue = current[field];
  if (!value || oldValue === value) return null;
  return {
    fields: { ...current, [field]: value },
    correction: { field, oldValue, newValue: value, timestamp: now.toISOString() },
  };
}
