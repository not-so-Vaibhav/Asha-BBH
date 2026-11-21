import { normalizeTranscript } from './normalize';

export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9,
  दस: 10, ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17,
  अठारह: 18, उन्नीस: 19, बीस: 20, इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25,
  छब्बीस: 26, सत्ताईस: 27, अट्ठाईस: 28, उनतीस: 29, तीस: 30, इकतीस: 31, बत्तीस: 32, तैंतीस: 33,
  चौंतीस: 34, पैंतीस: 35, छत्तीस: 36, सैंतीस: 37, अड़तीस: 38, अडतीस: 38, उनतालीस: 39,
  चालीस: 40, इकतालीस: 41, बयालीस: 42, तैंतालीस: 43, चौवालीस: 44, पैंतालीस: 45, छियालीस: 46,
  सैंतालीस: 47, अड़तालीस: 48, अडतालीस: 48, उनचास: 49, पचास: 50, इक्यावन: 51, बावन: 52, तिरपन: 53,
  चौवन: 54, पचपन: 55, छप्पन: 56, सत्तावन: 57, अट्ठावन: 58, उनसठ: 59, साठ: 60, इकसठ: 61,
  बासठ: 62, तिरसठ: 63, चौंसठ: 64, पैंसठ: 65, छियासठ: 66, सड़सठ: 67, सडसठ: 67, अड़सठ: 68,
  अडसठ: 68, उनहत्तर: 69, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100,
  दोन: 2, पाच: 5, सहा: 6, नऊ: 9, दहा: 10, अकरा: 11, बारा: 12, तेरा: 13, चौदा: 14,
  पंधरा: 15, सोळा: 16, सतरा: 17, अठरा: 18, एकोणीस: 19, वीस: 20, एकवीस: 21, बावीस: 22,
  तेवीस: 23, चोवीस: 24, पंचवीस: 25, सव्वीस: 26, सत्तावीस: 27, अठ्ठावीस: 28, एकोणतीस: 29,
  एकतीस: 31, चाळीस: 40, बेचाळीस: 42, पंचेचाळीस: 45, पन्नास: 50, बावन्न: 52, त्रेपन्न: 53, चोपन्न: 54,
  पंचावन्न: 55, पंचावन: 55, छप्पन्न: 56, सत्तावन्न: 57, अठ्ठावन्न: 58, ऐंशी: 80, नव्वद: 90, शंभर: 100,
};

export const SPOKEN_NUMBER_PATTERN = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|');
const numberToken = `(?:\\d+(?:[.,]\\d+)?|(?:${SPOKEN_NUMBER_PATTERN}))`;
const decimalWord = `(?:point|पॉइंट|दशमलव)`;

export const SPOKEN_NUMBER_PHRASE = new RegExp(
  `^(${numberToken}(?:[\\s-]+(?:and\\s+)?${numberToken}){0,4}(?:\\s+${decimalWord}\\s+${numberToken})?)`,
  'iu',
);

export function parseSpokenNumber(phrase: string): string | undefined {
  const normalized = normalizeTranscript(phrase).toLocaleLowerCase().replace(/-/g, ' ').trim();
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) return normalized.replace(',', '.');

  const decParts = normalized.split(/\s+(?:point|पॉइंट|दशमलव)\s+/u);
  if (decParts.length === 2) {
    const whole = parseSpokenNumber(decParts[0]);
    const frac = parseSpokenNumber(decParts[1]);
    if (whole !== undefined && frac !== undefined) return `${whole}.${frac}`;
    return undefined;
  }

  const tokens = normalized.split(/\s+/).filter((token) => token !== 'and');
  if (!tokens.length || tokens.some((token) => NUMBER_WORDS[token] === undefined)) return undefined;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    const value = NUMBER_WORDS[token];
    if (value === 100) current = (current || 1) * 100;
    else if (value >= 20 && value % 10 === 0) current += value;
    else if (value < 20 && current >= 20) current += value;
    else if (current) { total += current; current = value; }
    else current = value;
  }
  return String(total + current);
}
