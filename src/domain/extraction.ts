import type { VisitFields, VisitType } from './types';
import { parseVisitDate } from './dateParser';

const WESTERN_DIGITS: Record<string, string> = Object.fromEntries(
  [...'०१२३४५६७८९'].map((digit, index) => [digit, String(index)]),
);
const western = (value: string) => value.replace(/[०-९]/g, digit => WESTERN_DIGITS[digit]);

const numberWords: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9,
  दस: 10, ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17,
  अठारह: 18, उन्नीस: 19, बीस: 20, इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25,
  छब्बीस: 26, सत्ताईस: 27, अट्ठाईस: 28, उनतीस: 29, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70,
  अस्सी: 80, नब्बे: 90, सौ: 100,
  दोन: 2, पाच: 5, सहा: 6, नऊ: 9, दहा: 10, अकरा: 11, बारा: 12, तेरा: 13, चौदा: 14,
  पंधरा: 15, सोळा: 16, सतरा: 17, अठरा: 18, एकोणीस: 19, वीस: 20, एकवीस: 21, बावीस: 22,
  तेवीस: 23, चोवीस: 24, पंचवीस: 25, सव्वीस: 26, सत्तावीस: 27, अठ्ठावीस: 28, एकोणतीस: 29, चाळीस: 40,
  पन्नास: 50, ऐंशी: 80, नव्वद: 90, शंभर: 100,
};

const spokenNumberWords = Object.keys(numberWords).sort((a, b) => b.length - a.length).join('|');
const numberToken = `(?:\\d+(?:[.,]\\d+)?|(?:${spokenNumberWords}))`;
const numberPhrase = new RegExp(`^(${numberToken}(?:[\\s-]+(?:and\\s+)?${numberToken}){0,4})`, 'iu');

function parseSpokenNumber(phrase: string): string | undefined {
  const normalized = phrase.toLocaleLowerCase().replace(/-/g, ' ').trim();
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) return normalized.replace(',', '.');

  const tokens = normalized.split(/\s+/).filter(token => token !== 'and');
  if (!tokens.length || tokens.some(token => numberWords[token] === undefined)) return undefined;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    const value = numberWords[token];
    if (value === 100) current = (current || 1) * 100;
    else if (value >= 20 && value % 10 === 0) current += value;
    else if (value < 20 && current >= 20) current += value;
    else if (current) { total += current; current = value; }
    else current = value;
  }
  return String(total + current);
}

function extractWeight(text: string): string {
  const label = /(?:\bweight\b|वजन)/iu.exec(text);
  if (!label) return '';
  const afterLabel = text.slice(label.index + label[0].length).replace(/^\s*(?:(?:is|है|आहे|of)\s*)?/iu, '');
  const phrase = numberPhrase.exec(afterLabel)?.[1];
  if (!phrase) return '';
  const value = parseSpokenNumber(phrase);
  if (!value || Number(value) <= 0 || Number(value) > 300) return '';
  return `${value} kg`;
}

export function extract(text: string, beneficiaryId: string, today = '2026-11-13'): VisitFields {
  const t = western(text);
  const visitTypes: [RegExp, VisitType][] = [
    [/\bANC\b/i, 'ANC'], [/\bPNC\b/i, 'PNC'], [/\bHBNC\b/i, 'HBNC'], [/\bHBYC\b/i, 'HBYC'],
    [/immuni[sz]ation|vaccination/i, 'Immunisation'], [/\bgeneral\b|normal visit/i, 'General'],
  ];
  const visitType = visitTypes.find(([pattern]) => pattern.test(t))?.[1] ?? 'General';
  const vax = t.match(/(?:vaccinations?|vaccines?|immuni[sz]ation)\s*(?:due)?\s*(?:are|is|due|:)?\s*([^,.!?]+)/i);
  const vaccinationsDue = vax?.[1]?.trim() || 'None reported';
  return {
    beneficiaryId,
    visitType,
    weight: extractWeight(t) || 'Not captured',
    vaccinationsDue,
    nextVisitDate: parseVisitDate(t, today) || 'Not set',
  };
}
