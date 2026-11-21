import { describe, it, expect } from 'vitest';
import { detectDanger, rules, scanDangerSigns } from './rules';
import { normalizeDevanagariUnicode } from './normalize';

describe('danger rule engine', () => {
  it('matches pregnancy bleeding in code mix and Marathi', () => {
    expect(detectDanger('Pregnant woman la bleeding hot aahe.', 'Pregnant')?.rule.id).toBe('PREG-01');
    expect(detectDanger('गर्भवतीला रक्तस्राव होत आहे', 'Pregnant', 'mr')?.rule.id).toBe('PREG-01');
  });

  it('matches pregnancy high fever', () => {
    expect(detectDanger('high fever', 'Pregnant')?.rule.id).toBe('PREG-02');
  });

  it.each(['no bleeding', 'bleeding nahi', 'सुनीताला bleeding नहीं आया है।'])('suppresses clear negation: %s', (text) => {
    expect(detectDanger(text, 'Pregnant')).toBeNull();
  });

  it('suppresses resolved past symptom near-miss', () => {
    expect(detectDanger('Baby had fever last week, now fine and active', 'Newborn')).toBeNull();
    expect(detectDanger('बच्चे को पहले बुखार था अब ठीक है।', 'Newborn', 'hi')).toBeNull();
  });

  it('normalizes Devanagari Unicode: NFC, chandrabindu/anusvara, nukta, ZWJ, and nasal conjuncts', () => {
    expect(normalizeDevanagariUnicode('साँस')).toBe('सांस');
    expect(normalizeDevanagariUnicode('ठण्डा')).toBe('ठंडा');
    expect(normalizeDevanagariUnicode('रक्त\u200Dस्त्राव')).toBe('रक्तस्राव');
    expect(detectDanger('बच्चे को तेज़ साँस चल रही है और साँस लेने में कठिनाई है।', 'Newborn', 'hi')?.rule.id).toBe('NB-04');
    expect(detectDanger('बच्चे को पीली हथेलियाँ हैं।', 'Newborn', 'hi')?.rule.id).toBe('NB-05');
    expect(detectDanger('नवजात बच्चा छूने पर ठण्डा लग रहा है।', 'Newborn', 'hi')?.rule.id).toBe('NB-02');
  });

  it('applies controlled edit-distance-1 fuzzy matching for >=5-char lexicon words without false alerts', () => {
    // >=5-char Marathi compound word split + 1 edit ("तळहात" vs "तण हात")
    const nb05 = detectDanger('बाळाला आखडी येते आणि पिवळे तण हात आहेत।', 'Newborn', 'mr');
    expect(nb05?.rule.id).toBe('NB-05');
    expect(nb05?.fuzzy).toBe(true);

    // >=5-char English typo ("bleding" edit distance 1 from "bleeding")
    const preg01 = detectDanger('Pregnant woman has bleding today.', 'Pregnant', 'en');
    expect(preg01?.rule.id).toBe('PREG-01');
    expect(preg01?.fuzzy).toBe(true);

    // Negation still suppresses fuzzy matches
    expect(detectDanger('No bleding reported.', 'Pregnant', 'en')).toBeNull();
    expect(detectDanger('पिवळे तण हात नाहीत.', 'Newborn', 'mr')).toBeNull();

    // Non-danger near-miss English words must NEVER trigger fuzzy alerts
    expect(detectDanger('Leading mother to PHC, reading card, feeling fine, never sick.', 'Pregnant', 'en')).toBeNull();
    expect(detectDanger('Baby is feeding well, feeling active, living near river.', 'Newborn', 'en')).toBeNull();
  });

  it('keeps unreviewed Devanagari-transliterated English candidates in pending_review and disabled for alerts', () => {
    for (const rule of rules) {
      expect(rule.pending_review?.hi?.length).toBeGreaterThan(0);
      expect(rule.pending_review?.mr?.length).toBeGreaterThan(0);
    }
    // Unreviewed transliterated English phrases must NOT trigger alerts yet
    expect(detectDanger('बच्चे को फिव्हर आहे', 'Newborn', 'mr')).toBeNull();
    expect(detectDanger('बच्चे को फास्ट ब्रीदिंग है', 'Newborn', 'hi')).toBeNull();
    expect(detectDanger('गर्भवती को हाई फीवर है', 'Pregnant', 'hi')).toBeNull();
  });

  it('alerts on ambiguous bleeding with review flag', () => {
    expect(detectDanger('maybe bleeding', 'Pregnant')?.needsReview).toBe(true);
  });

  it('does not cross-apply rules to children', () => {
    expect(detectDanger('bleeding and high fever', 'Child')).toBeNull();
  });

  it('matches newborn high fever and code-mixed not feeding only for newborns', () => {
    expect(scanDangerSigns('Baby has high fever and doodh pit nahi', 'Newborn').map((x) => x.rule.id)).toEqual(['NB-01', 'NB-03']);
    expect(scanDangerSigns('high fever and doodh pit nahi', 'Child')).toEqual([]);
  });

  it.each(['cold to touch', 'not feeding', 'fast breathing', 'weak cry', 'limp', 'convulsions', 'yellow palms and soles'])(
    'recognizes newborn rule phrase %s',
    (text) => {
      expect(detectDanger(text, 'Newborn')).not.toBeNull();
    },
  );

  it('waits for a trailing negation while speech is streaming', () => {
    expect(detectDanger('bleeding', 'Pregnant', 'en', false)).toBeNull();
    expect(detectDanger('bleeding nahi', 'Pregnant', 'en', false)).toBeNull();
  });
});
