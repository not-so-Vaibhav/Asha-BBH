const monthMap: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const western = (value: string) => value.replace(/[०-९]/g, d => String('०१२३४५६७८९'.indexOf(d)));
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function validIso(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseVisitDate(text: string, today = '2026-11-13'): string {
  const t = western(text.toLowerCase());
  const base = new Date(`${today}T12:00:00`);
  if (/\b(?:tomorrow|kal)\b|कल/.test(t)) { base.setDate(base.getDate() + 1); return iso(base); }
  if (/\b(?:day after tomorrow|parwa)\b|परवा/.test(t)) { base.setDate(base.getDate() + 2); return iso(base); }
  if (/next\s+monday/.test(t)) { const add = (8 - base.getDay()) % 7 || 7; base.setDate(base.getDate() + add); return iso(base); }

  const numeric = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\/\s.-]+(\d{1,2})[\/\s.-]+(\d{4})\b/);
  if (numeric) return validIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const named = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)(?:\s*,?\s*(\d{4}))?\b/);
  if (named) {
    const day = Number(named[1]);
    const month = monthMap[named[2]];
    let year = Number(named[3] || base.getFullYear());
    if (!named[3] && (month < base.getMonth() + 1 || (month === base.getMonth() + 1 && day < base.getDate()))) year++;
    return validIso(year, month, day);
  }
  const isoDate = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return isoDate ? validIso(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])) : '';
}
