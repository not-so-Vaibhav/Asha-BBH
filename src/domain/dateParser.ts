import { normalizeTranscript } from './normalize';
import { NUMBER_WORDS } from './numbers';

const monthMap: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  जनवरी: 1, फरवरी: 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6, जुलाई: 7,
  अगस्त: 8, सितंबर: 9, अक्टूबर: 10, नवंबर: 11, दिसंबर: 12,
  जानेवारी: 1, फेब्रुवारी: 2, एप्रिल: 4, मे: 5, जुलै: 7,
  ऑगस्ट: 8, सप्टेंबर: 9, ऑक्टोबर: 10, नोव्हेंबर: 11, डिसेंबर: 12,
};

const DATE_SEP_WORDS = new Set(['slash', 'by', 'dash', 'hyphen', 'oblique', 'dot']);
const THOUSAND_WORDS = new Set(['thousand', 'हजार']);
const TWO_WORDS = new Set(['2', 'two', 'दो', 'दोन']);
const TWENTY_WORDS = new Set(['20', 'twenty', 'बीस', 'वीस']);
const ZERO_WORDS = new Set(['0', 'zero', 'oh']);
const AND_WORDS = new Set(['and', 'और', 'आणि']);
const UNIT_STOP_WORDS = new Set(['kg', 'kilo', 'kilos', 'gram', 'grams', 'cm', 'mm', 'years', 'year', 'yrs', 'months', 'days']);

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function validIso(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveDayMonth(day: number, month: number, explicitYear: number | undefined, base: Date): string {
  if (!Number.isInteger(day) || day < 1 || day > 31 || !month) return '';
  let year = explicitYear ?? base.getFullYear();
  if (!explicitYear && (month < base.getMonth() + 1 || (month === base.getMonth() + 1 && day < base.getDate()))) year++;
  return validIso(year, month, day);
}

function tokenizeDateText(normalizedLower: string): string[] {
  // Split dotted numeric dates like 21.11.2026 while keeping decimal weights like 3.2 intact
  const expanded = normalizedLower
    .replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g, '$1 $2 $3')
    .replace(/[\/,;:|]+/g, ' ')
    .replace(/(?<=\D)\.(?=\D|$)|(?<=\d)\.(?=\s|$)/g, ' ')
    .replace(/-/g, ' ');
  return expanded.split(/\s+/).filter(Boolean);
}

function parseSingleNumber(token: string, allowOrdinal = true): number | null {
  const digitMatch = allowOrdinal ? token.match(/^0*(\d{1,4})(?:st|nd|rd|th)?$/) : token.match(/^0*(\d{1,4})$/);
  if (digitMatch) return Number(digitMatch[1]);
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) return NUMBER_WORDS[token];
  return null;
}

/** Consumes a spoken or numeric integer in [min, max], preferring compound tens+units (e.g. "twenty one" / "twenty first"). */
function consumeNumberInRange(
  tokens: string[],
  start: number,
  min: number,
  max: number,
): { value: number; next: number } | null {
  const first = tokens[start];
  if (!first) return null;

  // Leading "zero" / "oh" + single digit (e.g. "zero five" -> 5)
  if (ZERO_WORDS.has(first) && start + 1 < tokens.length) {
    const nextVal = parseSingleNumber(tokens[start + 1], true);
    if (nextVal !== null && nextVal >= 1 && nextVal <= 9 && nextVal >= min && nextVal <= max) {
      return { value: nextVal, next: start + 2 };
    }
  }

  const v1 = parseSingleNumber(first, true);
  if (v1 === null) return null;

  // Compound tens + units (e.g. "twenty one" -> 21, "twenty first" -> 21, "thirty first" -> 31)
  if (v1 >= 20 && v1 <= 90 && v1 % 10 === 0 && start + 1 < tokens.length) {
    const second = tokens[start + 1];
    // Only combine with word units (not another digit like "20 26")
    if (!/^\d/.test(second)) {
      const v2 = parseSingleNumber(second, true);
      if (v2 !== null && v2 >= 1 && v2 <= 9) {
        const combined = v1 + v2;
        if (combined >= min && combined <= max) {
          return { value: combined, next: start + 2 };
        }
      }
    }
  }

  if (v1 >= min && v1 <= max) {
    return { value: v1, next: start + 1 };
  }
  return null;
}

function consumeMonth(
  tokens: string[],
  start: number,
): { value: number; next: number; isNamed: boolean } | null {
  const tok = tokens[start];
  if (!tok) return null;
  if (Object.prototype.hasOwnProperty.call(monthMap, tok)) {
    return { value: monthMap[tok], next: start + 1, isNamed: true };
  }
  const numeric = consumeNumberInRange(tokens, start, 1, 12);
  if (numeric) return { value: numeric.value, next: numeric.next, isNamed: false };
  return null;
}

function consumeYear(
  tokens: string[],
  start: number,
  allowTwoDigit: boolean,
): { value: number; next: number } | null {
  const t0 = tokens[start];
  if (!t0) return null;

  // 1. Explicit 4-digit year (e.g. 2026)
  if (/^20\d{2}$/.test(t0)) {
    return { value: Number(t0), next: start + 1 };
  }

  // 2. "two thousand [and] <0..99>" / "दो हजार <0..99>" / "दोन हजार <0..99>"
  if (TWO_WORDS.has(t0) && start + 1 < tokens.length && THOUSAND_WORDS.has(tokens[start + 1])) {
    let idx = start + 2;
    if (idx < tokens.length && AND_WORDS.has(tokens[idx])) idx += 1;
    const rem = consumeNumberInRange(tokens, idx, 0, 99);
    if (rem) {
      return { value: 2000 + rem.value, next: rem.next };
    }
    return { value: 2000, next: start + 2 };
  }

  // 3. Spoken century + decade/unit (e.g. "twenty twenty six" -> 2026, "20 26" -> 2026, "twenty oh six" -> 2006)
  if (TWENTY_WORDS.has(t0) && start + 1 < tokens.length) {
    const rem = consumeNumberInRange(tokens, start + 1, 1, 99);
    if (rem) {
      const after = tokens[rem.next];
      if (!after || !UNIT_STOP_WORDS.has(after)) {
        return { value: 2000 + rem.value, next: rem.next };
      }
    }
  }

  // 4. Two-digit year fallback after explicit day + month (e.g. "21 11 26" or "twenty-one eleven twenty-six")
  if (allowTwoDigit) {
    const twoDigit = consumeNumberInRange(tokens, start, 24, 39);
    if (twoDigit) {
      const after = tokens[twoDigit.next];
      if (!after || !UNIT_STOP_WORDS.has(after)) {
        return { value: 2000 + twoDigit.value, next: twoDigit.next };
      }
    }
  }

  return null;
}

function skipOptionalSeparator(tokens: string[], idx: number): number {
  if (idx < tokens.length && DATE_SEP_WORDS.has(tokens[idx])) return idx + 1;
  return idx;
}

function parseTokenizedDates(t: string, base: Date): string {
  const tokens = tokenizeDateText(t);

  // Pass 1: Explicit full numeric/spoken DD MM YYYY (or DD MM YY), e.g. "twenty-one eleven twenty twenty-six"
  for (let i = 0; i < tokens.length; i += 1) {
    const day = consumeNumberInRange(tokens, i, 1, 31);
    if (!day) continue;
    const afterDay = tokens[day.next];
    if (afterDay && UNIT_STOP_WORDS.has(afterDay)) continue;

    const mStart = skipOptionalSeparator(tokens, day.next);
    const month = consumeMonth(tokens, mStart);
    if (!month || month.isNamed) continue;
    const afterMonth = tokens[month.next];
    if (afterMonth && UNIT_STOP_WORDS.has(afterMonth)) continue;

    const yStart = skipOptionalSeparator(tokens, month.next);
    const year = consumeYear(tokens, yStart, true);
    if (!year) continue;

    const resolved = validIso(year.value, month.value, day.value);
    if (resolved) return resolved;
  }

  // Pass 2: Named month dates — Day + [of] + Month + [Year] (digits or spoken words)
  for (let i = 0; i < tokens.length; i += 1) {
    const day = consumeNumberInRange(tokens, i, 1, 31);
    if (!day) continue;
    let mStart = day.next;
    if (tokens[mStart] === 'of') mStart += 1;
    const month = consumeMonth(tokens, mStart);
    if (!month || !month.isNamed) continue;

    const year = consumeYear(tokens, month.next, false);
    const resolved = resolveDayMonth(day.value, month.value, year?.value, base);
    if (resolved) return resolved;
  }

  // Pass 3: Month-first named dates — Month + Day + [Year] (digits or spoken words)
  for (let i = 0; i < tokens.length; i += 1) {
    const month = consumeMonth(tokens, i);
    if (!month || !month.isNamed) continue;
    const day = consumeNumberInRange(tokens, month.next, 1, 31);
    if (!day) continue;

    const year = consumeYear(tokens, day.next, false);
    const resolved = resolveDayMonth(day.value, month.value, year?.value, base);
    if (resolved) return resolved;
  }

  // Pass 4: Explicit day-of-month with tarikh/तारीख/तारखेला when month is omitted
  for (let i = 0; i < tokens.length; i += 1) {
    const day = consumeNumberInRange(tokens, i, 1, 31);
    if (!day) continue;
    const cue = tokens[day.next];
    if (cue && /^(?:tarikh|tareekh|तारीख|तारखेला|तारीखेला)$/u.test(cue)) {
      let month = base.getMonth() + 1;
      let year = base.getFullYear();
      if (day.value < base.getDate()) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      const resolved = validIso(year, month, day.value);
      if (resolved) return resolved;
    }
  }

  return '';
}

export function parseVisitDate(text: string, today = '2026-11-13'): string {
  const t = normalizeTranscript(text).toLowerCase();
  const base = new Date(`${today}T12:00:00`);

  if (/\b(?:day after tomorrow|parwa|parson)\b|परवा|परसों/u.test(t)) {
    base.setDate(base.getDate() + 2);
    return iso(base);
  }
  if (/\b(?:tomorrow|kal|udya)\b|कल|उद्या/u.test(t)) {
    base.setDate(base.getDate() + 1);
    return iso(base);
  }
  if (/next\s+monday/.test(t)) {
    const add = (8 - base.getDay()) % 7 || 7;
    base.setDate(base.getDate() + add);
    return iso(base);
  }

  const isoDate = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDate) return validIso(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));

  const numeric4 = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\/\s.-]+(\d{1,2})[\/\s.-]+(\d{4})\b/);
  if (numeric4) return validIso(Number(numeric4[3]), Number(numeric4[2]), Number(numeric4[1]));

  return parseTokenizedDates(t, base);
}
