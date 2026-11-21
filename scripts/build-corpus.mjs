import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Generates:
 * - tests/corpus/manifest.json (200 utterances total: 40 dev + 40 test_v1 [seen regression] + 120 test_v2 [frozen human held-out])
 * - tests/corpus/test_split_frozen.json (test_v1, marked seen_regression_only; IDs & SHA-256 unchanged)
 * - tests/corpus/test_v2_frozen.json (test_v2, 120 unseen items frozen BEFORE human recording with SHA-256)
 * - tests/corpus/SCRIPT.md (complete human read-aloud recording script & guidance)
 */

const DEV_IDS = new Set([
  'NORM-MR-01', 'NORM-MR-02', 'NORM-MR-03', 'NORM-MR-04',
  'NORM-HI-01', 'NORM-HI-02', 'NORM-HI-03', 'NORM-HI-05',
  'NORM-EN-01', 'NORM-EN-02', 'NORM-EN-03', 'NORM-EN-04',
  'DANG-01', 'DANG-03', 'DANG-05', 'DANG-06', 'DANG-09', 'DANG-10',
  'DANG-13', 'DANG-16', 'DANG-18', 'DANG-21', 'DANG-22', 'DANG-24',
  'NEG-01', 'NEG-02', 'NEG-03', 'NEG-05', 'NEG-07', 'NEG-09', 'NEG-13', 'NEG-14',
  'CORR-01', 'CORR-02', 'CORR-05', 'CORR-06', 'CORR-09', 'CORR-10', 'CORR-12', 'CORR-15',
]);

const baseNormal = {
  beneficiaryId: 'BEN-1001',
  visitType: 'ANC',
  weight: '55 kg',
  vaccinationsDue: 'None reported',
  nextVisitDate: '2026-11-20',
};

// ============================================================
// Phase 2 / 2B corpus (80 items: 40 dev + 40 test_v1 seen)
// ============================================================
const normalV1 = [
  { id: 'NORM-MR-01', language: 'mr', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1001 सुनीता पाटील. आज ANC भेट घेतली. वजन 55 किलो आहे. लस काही नाही. पुढील भेट 20 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' } },
  { id: 'NORM-MR-02', language: 'mr', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'लाभार्थी BEN-1002 साठी HBNC भेट. वजन 3.2 किलो आहे. देय लसी BCG. पुढील भेट 18 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.2 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-18' } },
  { id: 'NORM-MR-03', language: 'mr', noiseLevel: 'household', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 रेखा जाधव यांची HBYC भेट. वजन 9 किलो आहे. देय लसी OPV. पुढील भेट 25 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9 kg', vaccinationsDue: 'OPV', nextVisitDate: '2026-11-25' } },
  { id: 'NORM-MR-04', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 मीना पवार. PNC भेट पूर्ण झाली. वजन 52 किलो आहे. पुढील भेट 22 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '52 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' } },
  { id: 'NORM-MR-05', language: 'mr', noiseLevel: 'clean', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 आरव कुलकर्णी. लसीकरण भेट. वजन 12 किलो. देय लसी DPT. पुढील भेट 28 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '12 kg', vaccinationsDue: 'DPT', nextVisitDate: '2026-11-28' } },
  { id: 'NORM-MR-06', language: 'mr', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 सामान्य भेट. वजन 56 किलो आहे. देय लसी TT2. पुढील भेट परवा.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'General', weight: '56 kg', vaccinationsDue: 'TT2', nextVisitDate: '2026-11-15' } },
  { id: 'NORM-MR-07', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 ANC भेट. वजन 54 किलो आहे. लस काही नाही. पुढील भेट 30 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'ANC', weight: '54 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-30' } },
  { id: 'NORM-MR-08', language: 'mr', noiseLevel: 'clean', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 साठी सामान्य भेट. वजन 10 किलो आहे. देय लसी Measles. पुढील भेट उद्या.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'General', weight: '10 kg', vaccinationsDue: 'Measles', nextVisitDate: '2026-11-14' } },
  { id: 'NORM-HI-01', language: 'hi', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1001 सुनीता पाटिल की ANC मुलाक़ात। वज़न 55 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात 20 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' } },
  { id: 'NORM-HI-02', language: 'hi', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'लाभार्थी BEN-1002 की HBNC मुलाक़ात। वज़न 3.4 किलो है। देय टीके BCG। अगली मुलाक़ात 19 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.4 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-19' } },
  { id: 'NORM-HI-03', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 रेखा जाधव की HBYC मुलाक़ात। वज़न 9.5 किलो है। देय टीके OPV। अगली मुलाक़ात 24 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9.5 kg', vaccinationsDue: 'OPV', nextVisitDate: '2026-11-24' } },
  { id: 'NORM-HI-04', language: 'hi', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 मीना पवार की PNC मुलाक़ात। वज़न 53 किलो है। अगली मुलाक़ात 23 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '53 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-23' } },
  { id: 'NORM-HI-05', language: 'hi', noiseLevel: 'clean', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 आरव कुलकर्णी टीकाकरण मुलाक़ात। वज़न 11 किलो है। देय टीके DPT। अगली मुलाक़ात 27 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '11 kg', vaccinationsDue: 'DPT', nextVisitDate: '2026-11-27' } },
  { id: 'NORM-HI-06', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 सामान्य मुलाक़ात। वज़न 57 किलो है। देय टीके TT1। अगली मुलाक़ात कल।', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'General', weight: '57 kg', vaccinationsDue: 'TT1', nextVisitDate: '2026-11-14' } },
  { id: 'NORM-HI-07', language: 'hi', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 ANC मुलाक़ात। वज़न 58 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात 29 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'ANC', weight: '58 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-29' } },
  { id: 'NORM-HI-08', language: 'hi', noiseLevel: 'clean', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 की सामान्य मुलाक़ात। वज़न 13 किलो है। देय टीके Polio। अगली मुलाक़ात 2 दिसंबर।', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'General', weight: '13 kg', vaccinationsDue: 'Polio', nextVisitDate: '2026-12-02' } },
  { id: 'NORM-EN-01', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 Aaj mi Sunita cha ANC follow-up visit ghetla. Weight 55 kilo aahe. Pudhil visit 20 November la theva.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' } },
  { id: 'NORM-EN-02', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Beneficiary BEN-1002 HBNC visit. Weight is 3.1 kg. Vaccinations due BCG. Next visit date 18 November.', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.1 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-18' } },
  { id: 'NORM-EN-03', language: 'en', noiseLevel: 'household', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 HBYC visit completed. Weight is 9 kg. Vaccinations due OPV and DPT. Next visit 25 November.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9 kg', vaccinationsDue: 'OPV and DPT', nextVisitDate: '2026-11-25' } },
  { id: 'NORM-EN-04', language: 'en', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'BEN-1004 PNC visit done. Weight 54 kg. Vaccinations due none. Next visit 22 November.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '54 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-22' } },
  { id: 'NORM-EN-05', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 Immunisation visit. Weight 12 kg. Vaccinations due Measles. Next visit 28 November.', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '12 kg', vaccinationsDue: 'Measles', nextVisitDate: '2026-11-28' } },
  { id: 'NORM-EN-06', language: 'mix', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 Sunita ka ANC visit kiya. Weight 56 kilo hai. Vaccinations due TT2. Next visit tomorrow.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'TT2', nextVisitDate: '2026-11-14' } },
  { id: 'NORM-EN-07', language: 'en', noiseLevel: 'street', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 General visit. Weight is 10 kg. Next visit date 14/11/2026.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'General', weight: '10 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-14' } },
  { id: 'NORM-EN-08', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'BEN-1004 Meena cha PNC visit aahe. Weight 51 kilo. Next visit next Monday.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '51 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-16' } },
].map((item) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'normal',
  speaker: 'speaker-1',
  expectedDangerRuleIds: [],
  expectedNeedsReview: false,
  baseFields: null,
  expectedCorrection: null,
}));

const dangerV1 = [
  { id: 'DANG-01', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Pregnant woman has vaginal bleeding since morning.', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'DANG-02', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'गर्भवती महिला को सुबह से खून आ रहा है।', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'DANG-03', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'गर्भवतीला सकाळपासून रक्तस्राव होत आहे.', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'DANG-04', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Pregnant woman la bleeding hot aahe.', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'DANG-05', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Mother has high fever and body ache today.', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'DANG-06', language: 'hi', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'गर्भवती महिला को बहुत तेज बुखार है।', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'DANG-07', language: 'mr', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'गर्भवतीला खूप ताप आला आहे.', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'DANG-08', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'Sunita la khup tap aala aahe, high fever.', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'DANG-09', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn baby feels hot to touch and has fever.', expectedDangerRuleIds: ['NB-01'] },
  { id: 'DANG-10', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात शिशु को बुखार है और शरीर गर्म है।', expectedDangerRuleIds: ['NB-01'] },
  { id: 'DANG-11', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बाळाला ताप आहे आणि अंग गरम आहे.', expectedDangerRuleIds: ['NB-01'] },
  { id: 'DANG-12', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn baby feels cold to touch.', expectedDangerRuleIds: ['NB-02'] },
  { id: 'DANG-13', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चा छूने पर ठंडा लग रहा है।', expectedDangerRuleIds: ['NB-02'] },
  { id: 'DANG-14', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाचे अंग थंड पडले आहे.', expectedDangerRuleIds: ['NB-02'] },
  { id: 'DANG-15', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby is not feeding and refuses feed since night.', expectedDangerRuleIds: ['NB-03'] },
  { id: 'DANG-16', language: 'hi', noiseLevel: 'street', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चा सुबह से दूध नहीं पी रहा है।', expectedDangerRuleIds: ['NB-03'] },
  { id: 'DANG-17', language: 'mr', noiseLevel: 'household', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बाळ दूध पीत नाही.', expectedDangerRuleIds: ['NB-03'] },
  { id: 'DANG-18', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn has fast breathing and difficulty breathing.', expectedDangerRuleIds: ['NB-04'] },
  { id: 'DANG-19', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बच्चे को तेज सांस चल रही है और सांस लेने में कठिनाई है।', expectedDangerRuleIds: ['NB-04'] },
  { id: 'DANG-20', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाला जलद श्वास आहे आणि श्वास घ्यायला त्रास होतो.', expectedDangerRuleIds: ['NB-04'] },
  { id: 'DANG-21', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby has weak cry and yellow palms and soles.', expectedDangerRuleIds: ['NB-05'] },
  { id: 'DANG-22', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बच्चे को दौरे आ रहे हैं और पीली हथेलियां हैं।', expectedDangerRuleIds: ['NB-05'] },
  { id: 'DANG-23', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाला आकडी येते आणि पिवळे तळहात आहेत.', expectedDangerRuleIds: ['NB-05'] },
  { id: 'DANG-24', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby has high fever and doodh pit nahi.', expectedDangerRuleIds: ['NB-01', 'NB-03'] },
].map((item) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'danger',
  speaker: 'speaker-1',
  expectedFields: null,
  expectedNeedsReview: false,
  baseFields: null,
  expectedCorrection: null,
}));

const negationV1 = [
  { id: 'NEG-01', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'No bleeding reported during checkup.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-02', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Sunita la bleeding nahi aahe.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-03', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'गर्भवती को रक्तस्राव नहीं है और तेज बुखार नहीं है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-04', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'गर्भवतीला रक्तस्राव नाही आणि जास्त ताप नाही.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-05', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby had fever last week, now fine and active.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-06', language: 'en', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Had high fever yesterday, now normal and healthy.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-07', language: 'hi', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बच्चे को पहले बुखार था अब ठीक है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-08', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाला आधी ताप होता आता बरे आहे.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-09', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'No fever, no cold to touch, baby is feeding well.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-10', language: 'en', noiseLevel: 'household', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Without fast breathing and without convulsions.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-11', language: 'mix', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'High fever nahi hai, sab normal hai.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-12', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'Child has fever and not feeding well.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'NEG-13', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Maybe bleeding, family is not sure.', expectedDangerRuleIds: ['PREG-01'], expectedNeedsReview: true },
  { id: 'NEG-14', language: 'hi', noiseLevel: 'household', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'शायद रक्तस्राव हो रहा है।', expectedDangerRuleIds: ['PREG-01'], expectedNeedsReview: true },
  { id: 'NEG-15', language: 'mr', noiseLevel: 'street', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'कदाचित रक्तस्राव होत आहे, नक्की नाही.', expectedDangerRuleIds: ['PREG-01'], expectedNeedsReview: true },
  { id: 'NEG-16', language: 'en', noiseLevel: 'clean', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Unclear if baby has fever, might be warm.', expectedDangerRuleIds: ['NB-01'], expectedNeedsReview: true },
].map((item) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'negation',
  speaker: 'speaker-1',
  expectedFields: null,
  baseFields: null,
  expectedCorrection: null,
}));

const correctionsV1 = [
  { id: 'CORR-01', language: 'en', noiseLevel: 'clean', promptText: 'No, weight is 56 kilo.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '56 kg' } },
  { id: 'CORR-02', language: 'hi', noiseLevel: 'clean', promptText: 'नहीं, वज़न 58 किलो है।', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '58 kg' } },
  { id: 'CORR-03', language: 'mr', noiseLevel: 'household', promptText: 'नाही, वजन 54 किलो आहे.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '54 kg' } },
  { id: 'CORR-04', language: 'en', noiseLevel: 'street', promptText: 'Weight is fifty seven kg.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '57 kg' } },
  { id: 'CORR-05', language: 'en', noiseLevel: 'clean', promptText: 'No, next visit is 22 November.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-22' } },
  { id: 'CORR-06', language: 'hi', noiseLevel: 'household', promptText: 'अगली मुलाक़ात 25 नवंबर।', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-25' } },
  { id: 'CORR-07', language: 'mr', noiseLevel: 'street', promptText: 'पुढील भेट 26 नोव्हेंबर.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-26' } },
  { id: 'CORR-08', language: 'en', noiseLevel: 'clean', promptText: 'Next visit date tomorrow.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-14' } },
  { id: 'CORR-09', language: 'en', noiseLevel: 'clean', promptText: 'Vaccinations due: OPV and DPT.', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'OPV and DPT' } },
  { id: 'CORR-10', language: 'hi', noiseLevel: 'household', promptText: 'देय टीके: TT2।', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'TT2' } },
  { id: 'CORR-11', language: 'mr', noiseLevel: 'clean', promptText: 'देय लसी: BCG.', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'BCG' } },
  { id: 'CORR-12', language: 'en', noiseLevel: 'clean', promptText: 'Visit type is PNC.', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'PNC' } },
  { id: 'CORR-13', language: 'en', noiseLevel: 'street', promptText: 'Change visit type to HBNC.', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'HBNC' } },
  { id: 'CORR-14', language: 'hi', noiseLevel: 'clean', promptText: 'मुलाक़ात का प्रकार टीकाकरण।', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'Immunisation' } },
  { id: 'CORR-15', language: 'en', noiseLevel: 'clean', promptText: 'Beneficiary ID is BEN-1002.', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1002' } },
  { id: 'CORR-16', language: 'mr', noiseLevel: 'household', promptText: 'लाभार्थी ID BEN-1004 आहे.', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1004' } },
].map((item) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'correction',
  speaker: 'speaker-1',
  beneficiaryId: 'BEN-1001',
  beneficiaryKind: 'Pregnant',
  expectedFields: null,
  expectedDangerRuleIds: [],
  expectedNeedsReview: false,
  baseFields: baseNormal,
}));

// ============================================================
// Phase 3 Real Held-Out Human Test Set: test_v2 (120 unseen items)
// 33 normal, 33 danger, 30 corrections, 24 negation/near-miss
// 2 speakers (speaker-1 female, speaker-2 male/second), 50% noisy (25% household, 25% street)
// ============================================================
const noisePattern = ['clean', 'household', 'clean', 'street'];
const speakerFor = (idx) => (idx % 2 === 0 ? 'speaker-1' : 'speaker-2');
const noiseFor = (idx) => noisePattern[idx % noisePattern.length];

const normalV2 = [
  // 11 English / code-mix normal visits
  { id: 'V2-NORM-01', language: 'en', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Beneficiary BEN-1001 Sunita Patil ANC visit completed. Weight 56 kg. Vaccinations due TT1. Next visit 21 November.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'TT1', nextVisitDate: '2026-11-21' } },
  { id: 'V2-NORM-02', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'BEN-1002 HBNC home check done. Weight is 3.3 kg. Vaccinations due BCG and OPV. Next visit 17 November.', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.3 kg', vaccinationsDue: 'BCG and OPV', nextVisitDate: '2026-11-17' } },
  { id: 'V2-NORM-03', language: 'en', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 HBYC visit. Weight 9.4 kg. Vaccinations due Pentavalent. Next visit 26 November.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9.4 kg', vaccinationsDue: 'Pentavalent', nextVisitDate: '2026-11-26' } },
  { id: 'V2-NORM-04', language: 'en', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'BEN-1004 PNC follow-up done. Weight 53 kg. Vaccinations due none. Next visit 24 November.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '53 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-24' } },
  { id: 'V2-NORM-05', language: 'en', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 Immunisation session. Weight 11.5 kg. Vaccinations due MR. Next visit 29 November.', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '11.5 kg', vaccinationsDue: 'MR', nextVisitDate: '2026-11-29' } },
  { id: 'V2-NORM-06', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'BEN-1002 HBNC visit. Weight 2.9 kg. Vaccinations due Hepatitis B. Next visit 16 November.', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '2.9 kg', vaccinationsDue: 'Hepatitis B', nextVisitDate: '2026-11-16' } },
  { id: 'V2-NORM-07', language: 'en', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 General checkup. Weight 57 kg. Vaccinations due TT2. Next visit 3 December.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'General', weight: '57 kg', vaccinationsDue: 'TT2', nextVisitDate: '2026-12-03' } },
  { id: 'V2-NORM-08', language: 'mix', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 Rekha ka HBYC visit kiya. Weight 8.8 kg hai. Vaccinations due Measles. Next visit 27 November.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '8.8 kg', vaccinationsDue: 'Measles', nextVisitDate: '2026-11-27' } },
  { id: 'V2-NORM-09', language: 'mix', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'BEN-1004 Meena cha ANC visit zala. Weight 55 kilo aahe. Vaccines none due. Pudhil visit 1 December.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-12-01' } },
  { id: 'V2-NORM-10', language: 'en', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 General visit done. Weight 12.2 kg. Vaccinations due DPT. Next visit 21/11/2026.', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'General', weight: '12.2 kg', vaccinationsDue: 'DPT', nextVisitDate: '2026-11-21' } },
  { id: 'V2-NORM-11', language: 'mix', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 ANC visit complete. Weight 54.5 kg. Vaccinations due TT1. Next visit day after tomorrow.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '54.5 kg', vaccinationsDue: 'TT1', nextVisitDate: '2026-11-15' } },

  // 11 Hindi normal visits
  { id: 'V2-NORM-12', language: 'hi', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1001 सुनीता की ANC मुलाक़ात। वज़न 56 किलो है। देय टीके TT1। अगली मुलाक़ात 21 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'TT1', nextVisitDate: '2026-11-21' } },
  { id: 'V2-NORM-13', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'लाभार्थी BEN-1002 की HBNC मुलाक़ात। वज़न 3.3 किलो है। देय टीके हेपेटाइटिस बी। अगली मुलाक़ात 17 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.3 kg', vaccinationsDue: 'Hepatitis B', nextVisitDate: '2026-11-17' } },
  { id: 'V2-NORM-14', language: 'hi', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 की HBYC मुलाक़ात पूरी हुई। वज़न 9.2 किलो है। देय टीके पेंटावेलेंट। अगली मुलाक़ात 26 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9.2 kg', vaccinationsDue: 'Pentavalent', nextVisitDate: '2026-11-26' } },
  { id: 'V2-NORM-15', language: 'hi', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 की PNC मुलाक़ात। वज़न 52 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात 24 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '52 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-24' } },
  { id: 'V2-NORM-16', language: 'hi', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 टीकाकरण मुलाक़ात। वज़न 11.5 किलो है। देय टीके खसरा। अगली मुलाक़ात 29 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '11.5 kg', vaccinationsDue: 'Measles', nextVisitDate: '2026-11-29' } },
  { id: 'V2-NORM-17', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'लाभार्थी BEN-1002 HBNC मुलाक़ात। वज़न 3.5 किलो है। देय टीके बीसीजी। अगली मुलाक़ात 18 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.5 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-18' } },
  { id: 'V2-NORM-18', language: 'hi', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 सामान्य मुलाक़ात। वज़न 58 किलो है। देय टीके TT2। अगली मुलाक़ात 4 दिसंबर।', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'General', weight: '58 kg', vaccinationsDue: 'TT2', nextVisitDate: '2026-12-04' } },
  { id: 'V2-NORM-19', language: 'hi', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 टीकाकरण मुलाक़ात। वज़न 10 किलो है। देय टीके पोलियो और डीपीटी। अगली मुलाक़ात 28 नवंबर।', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'Immunisation', weight: '10 kg', vaccinationsDue: 'OPV and DPT', nextVisitDate: '2026-11-28' } },
  { id: 'V2-NORM-20', language: 'hi', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 ANC मुलाक़ात। वज़न 54 किलो है। टीके कोई नहीं। अगली मुलाक़ात परसों।', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'ANC', weight: '54 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-15' } },
  { id: 'V2-NORM-21', language: 'hi', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 सामान्य मुलाक़ात। वज़न 12 किलो है। देय टीके एमआर। अगली मुलाक़ात 1 दिसंबर।', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'General', weight: '12 kg', vaccinationsDue: 'MR', nextVisitDate: '2026-12-01' } },
  { id: 'V2-NORM-22', language: 'hi', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 ANC मुलाक़ात। वज़न 55.5 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात कल।', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55.5 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-14' } },

  // 11 Marathi normal visits
  { id: 'V2-NORM-23', language: 'mr', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1001 सुनीता पाटील यांची ANC भेट. वजन 56 किलो आहे. देय लसी TT1. पुढील भेट 21 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '56 kg', vaccinationsDue: 'TT1', nextVisitDate: '2026-11-21' } },
  { id: 'V2-NORM-24', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'लाभार्थी BEN-1002 साठी HBNC भेट. वजन 3.3 किलो आहे. देय लसी हेपॅटायटिस बी. पुढील भेट 17 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.3 kg', vaccinationsDue: 'Hepatitis B', nextVisitDate: '2026-11-17' } },
  { id: 'V2-NORM-25', language: 'mr', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 रेखा जाधव यांची HBYC भेट. वजन 9.2 किलो आहे. देय लसी पेंटाव्हॅलेंट. पुढील भेट 26 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'HBYC', weight: '9.2 kg', vaccinationsDue: 'Pentavalent', nextVisitDate: '2026-11-26' } },
  { id: 'V2-NORM-26', language: 'mr', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 मीना पवार यांची PNC भेट. वजन 52 किलो आहे. लस काही नाही. पुढील भेट 24 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'PNC', weight: '52 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-24' } },
  { id: 'V2-NORM-27', language: 'mr', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 लसीकरण भेट. वजन 11.5 किलो आहे. देय लसी गोवर. पुढील भेट 29 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'Immunisation', weight: '11.5 kg', vaccinationsDue: 'Measles', nextVisitDate: '2026-11-29' } },
  { id: 'V2-NORM-28', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'लाभार्थी BEN-1002 HBNC भेट. वजन 3.4 किलो आहे. देय लसी बीसीजी. पुढील भेट 19 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1002', visitType: 'HBNC', weight: '3.4 kg', vaccinationsDue: 'BCG', nextVisitDate: '2026-11-19' } },
  { id: 'V2-NORM-29', language: 'mr', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 सामान्य भेट. वजन 57 किलो आहे. देय लसी TT2. पुढील भेट 4 डिसेंबर.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'General', weight: '57 kg', vaccinationsDue: 'TT2', nextVisitDate: '2026-12-04' } },
  { id: 'V2-NORM-30', language: 'mr', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'BEN-1003 लसीकरण भेट. वजन 10 किलो आहे. देय लसी पोलिओ आणि डीपीटी. पुढील भेट 27 नोव्हेंबर.', expectedFields: { beneficiaryId: 'BEN-1003', visitType: 'Immunisation', weight: '10 kg', vaccinationsDue: 'OPV and DPT', nextVisitDate: '2026-11-27' } },
  { id: 'V2-NORM-31', language: 'mr', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'लाभार्थी BEN-1004 ANC भेट. वजन 53.5 किलो आहे. लस काही नाही. पुढील भेट परवा.', expectedFields: { beneficiaryId: 'BEN-1004', visitType: 'ANC', weight: '53.5 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-15' } },
  { id: 'V2-NORM-32', language: 'mr', beneficiaryId: 'BEN-1005', beneficiaryKind: 'Child', promptText: 'BEN-1005 सामान्य भेट. वजन 12 किलो आहे. देय लसी एमआर. पुढील भेट 1 डिसेंबर.', expectedFields: { beneficiaryId: 'BEN-1005', visitType: 'General', weight: '12 kg', vaccinationsDue: 'MR', nextVisitDate: '2026-12-01' } },
  { id: 'V2-NORM-33', language: 'mr', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'BEN-1001 ANC भेट पूर्ण झाली. वजन 55 किलो आहे. लस काही नाही. पुढील भेट उद्या.', expectedFields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-14' } },
].map((item, idx) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'normal',
  noiseLevel: noiseFor(idx),
  speaker: speakerFor(idx),
  expectedDangerRuleIds: [],
  expectedNeedsReview: false,
  baseFields: null,
  expectedCorrection: null,
}));

const dangerV2 = [
  // PREG-01 (5: en, hi, mr, mix, hi)
  { id: 'V2-DANG-01', language: 'en', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Sunita reports heavy vaginal bleeding since last night.', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'V2-DANG-02', language: 'hi', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'मीना को कल रात से खून बह रहा है।', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'V2-DANG-03', language: 'mr', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'सुनीताला आज सकाळी रक्त जात आहे.', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'V2-DANG-04', language: 'mix', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'Meena ko subah se khoon aa raha hai, bleeding aahe.', expectedDangerRuleIds: ['PREG-01'] },
  { id: 'V2-DANG-05', language: 'en', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'Pregnant mother has spotting with blood today.', expectedDangerRuleIds: ['PREG-01'] },

  // PREG-02 (5: en, hi, mr, mix, mr)
  { id: 'V2-DANG-06', language: 'en', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Pregnant woman has severe fever with chills.', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'V2-DANG-07', language: 'hi', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'गर्भवती को रात से ज्यादा बुखार है।', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'V2-DANG-08', language: 'mr', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'गर्भवती महिलेला तीव्र ताप आला आहे.', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'V2-DANG-09', language: 'mix', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Sunita ko tez bukhar hai aaj.', expectedDangerRuleIds: ['PREG-02'] },
  { id: 'V2-DANG-10', language: 'en', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'Mother has very high temperature since evening.', expectedDangerRuleIds: ['PREG-02'] },

  // NB-01 (5: en, hi, mr, mix, hi)
  { id: 'V2-DANG-11', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn body is hot and baby has fever.', expectedDangerRuleIds: ['NB-01'] },
  { id: 'V2-DANG-12', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चे का बदन गर्म है और बुखार है।', expectedDangerRuleIds: ['NB-01'] },
  { id: 'V2-DANG-13', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बाळाचे शरीर गरम लागते आणि ताप आहे.', expectedDangerRuleIds: ['NB-01'] },
  { id: 'V2-DANG-14', language: 'mix', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby ka ang garam hai, fever aahe.', expectedDangerRuleIds: ['NB-01'] },
  { id: 'V2-DANG-15', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'शिशु छूने पर गर्म लग रहा है।', expectedDangerRuleIds: ['NB-01'] },

  // NB-02 (4: en, hi, mr, mix)
  { id: 'V2-DANG-16', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn body is cold and feels cold to touch.', expectedDangerRuleIds: ['NB-02'] },
  { id: 'V2-DANG-17', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चे का शरीर ठंडा पड़ गया है।', expectedDangerRuleIds: ['NB-02'] },
  { id: 'V2-DANG-18', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बाळाचे शरीर थंड लागते.', expectedDangerRuleIds: ['NB-02'] },
  { id: 'V2-DANG-19', language: 'mix', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby cha ang thand aahe, cold to touch.', expectedDangerRuleIds: ['NB-02'] },

  // NB-03 (5: en, hi, mr, mix, mr)
  { id: 'V2-DANG-20', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn is unable to feed and not taking milk.', expectedDangerRuleIds: ['NB-03'] },
  { id: 'V2-DANG-21', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात शिशु स्तनपान नहीं कर रहा है।', expectedDangerRuleIds: ['NB-03'] },
  { id: 'V2-DANG-22', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळ सकाळपासून दूध घेत नाही.', expectedDangerRuleIds: ['NB-03'] },
  { id: 'V2-DANG-23', language: 'mix', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn doodh nahi pi raha, refusing feed.', expectedDangerRuleIds: ['NB-03'] },
  { id: 'V2-DANG-24', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बच्ची रात से दूध नहीं पी रही है।', expectedDangerRuleIds: ['NB-03'] },

  // NB-04 (5: en, hi, mr, mix, hi)
  { id: 'V2-DANG-25', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn has rapid breathing and chest indrawing.', expectedDangerRuleIds: ['NB-04'] },
  { id: 'V2-DANG-26', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चे को सांस लेने में तकलीफ है।', expectedDangerRuleIds: ['NB-04'] },
  { id: 'V2-DANG-27', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाला श्वास घेण्यास त्रास आणि दम लागणे आहे.', expectedDangerRuleIds: ['NB-04'] },
  { id: 'V2-DANG-28', language: 'mix', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby ko tez saans aa rahi hai, fast breathing.', expectedDangerRuleIds: ['NB-04'] },
  { id: 'V2-DANG-29', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात शिशु की सांस फूल रही है।', expectedDangerRuleIds: ['NB-04'] },

  // NB-05 (4: en, hi, mr, mix)
  { id: 'V2-DANG-30', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Newborn is lethargic and had convulsions today.', expectedDangerRuleIds: ['NB-05'] },
  { id: 'V2-DANG-31', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चा सुस्त है और पीले तलवे दिख रहे हैं।', expectedDangerRuleIds: ['NB-05'] },
  { id: 'V2-DANG-32', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळ निस्तेज आहे आणि झटके येत आहेत.', expectedDangerRuleIds: ['NB-05'] },
  { id: 'V2-DANG-33', language: 'mix', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Baby ka cry weak cry hai aur daure aa rahe hain.', expectedDangerRuleIds: ['NB-05'] },
].map((item, idx) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'danger',
  noiseLevel: noiseFor(idx),
  speaker: speakerFor(idx),
  expectedFields: null,
  expectedNeedsReview: false,
  baseFields: null,
  expectedCorrection: null,
}));

const negationV2 = [
  // 18 clear negations & resolved near-misses (6 en, 6 hi, 6 mr)
  { id: 'V2-NEG-01', language: 'en', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'No signs of bleeding and no high fever today.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-02', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'No fever, baby is feeding normally and active.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-03', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Without cold to touch and without fast breathing.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-04', language: 'en', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'Mother had high fever three days ago, now fine and eating well.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-05', language: 'en', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'Older child has fever and cold today.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-06', language: 'mix', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Meena ko bleeding nahi hai, sab theek hai.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-07', language: 'hi', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'गर्भवती को खून आना नहीं है और बुखार नहीं है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-08', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बच्चे को बुखार नहीं है और ठंडा नहीं है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-09', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बच्चे को तेज सांस नहीं है और दौरे नहीं हैं।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-10', language: 'hi', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'पहले तेज बुखार था अब सामान्य है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-11', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात को कोई झटके नहीं और सुस्त नहीं है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-12', language: 'hi', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'बड़े बच्चे को बुखार है लेकिन नवजात नहीं है।', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-13', language: 'mr', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'मीनाला रक्तस्राव नाही आणि खूप ताप नाही.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-14', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'नवजात बाळाला ताप नाही आणि अंग थंड नाही.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-15', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाला जलद श्वास नाही आणि आकडी नाही.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-16', language: 'mr', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'गर्भवतीला आधी जास्त ताप होता आता ठीक आहे.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-17', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'बाळाला झटके नाहीत आणि निस्तेज नाही.', expectedDangerRuleIds: [], expectedNeedsReview: false },
  { id: 'V2-NEG-18', language: 'mr', beneficiaryId: 'BEN-1003', beneficiaryKind: 'Child', promptText: 'मोठ्या मुलाला ताप आहे पण ते नवजात नाही.', expectedDangerRuleIds: [], expectedNeedsReview: false },

  // 6 recall-first ambiguous cases (2 en, 2 hi, 2 mr)
  { id: 'V2-NEG-19', language: 'en', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'Possibly high fever, mother is not sure.', expectedDangerRuleIds: ['PREG-02'], expectedNeedsReview: true },
  { id: 'V2-NEG-20', language: 'en', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'Not sure if newborn has fast breathing.', expectedDangerRuleIds: ['NB-04'], expectedNeedsReview: true },
  { id: 'V2-NEG-21', language: 'hi', beneficiaryId: 'BEN-1004', beneficiaryKind: 'Pregnant', promptText: 'शायद गर्भवती को तेज बुखार है, पता नहीं।', expectedDangerRuleIds: ['PREG-02'], expectedNeedsReview: true },
  { id: 'V2-NEG-22', language: 'hi', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'शायद बच्चे को बुखार है।', expectedDangerRuleIds: ['NB-01'], expectedNeedsReview: true },
  { id: 'V2-NEG-23', language: 'mr', beneficiaryId: 'BEN-1001', beneficiaryKind: 'Pregnant', promptText: 'कदाचित गर्भवतीला जास्त ताप आहे.', expectedDangerRuleIds: ['PREG-02'], expectedNeedsReview: true },
  { id: 'V2-NEG-24', language: 'mr', beneficiaryId: 'BEN-1002', beneficiaryKind: 'Newborn', promptText: 'कदाचित बाळ दूध पीत नाही, नक्की नाही.', expectedDangerRuleIds: ['NB-03'], expectedNeedsReview: true },
].map((item, idx) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'negation',
  noiseLevel: noiseFor(idx),
  speaker: speakerFor(idx),
  expectedFields: null,
  baseFields: null,
  expectedCorrection: null,
}));

const correctionsV2 = [
  // Weight (6: 2 en, 2 hi, 2 mr)
  { id: 'V2-CORR-01', language: 'en', promptText: 'No, weight is 58.5 kg.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '58.5 kg' } },
  { id: 'V2-CORR-02', language: 'en', promptText: 'Weight is sixty two kilo.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '62 kg' } },
  { id: 'V2-CORR-03', language: 'hi', promptText: 'वज़न उनसठ किलो है।', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '59 kg' } },
  { id: 'V2-CORR-04', language: 'hi', promptText: 'नहीं, वज़न 54.5 किलो है।', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '54.5 kg' } },
  { id: 'V2-CORR-05', language: 'mr', promptText: 'नाही, वजन सत्तावन्न किलो आहे.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '57 kg' } },
  { id: 'V2-CORR-06', language: 'mr', promptText: 'वजन 53.5 किलो करा.', expectedCorrection: { field: 'weight', oldValue: '55 kg', newValue: '53.5 kg' } },

  // Next visit date (6: 2 en, 2 hi, 2 mr)
  { id: 'V2-CORR-07', language: 'en', promptText: 'Next visit date will be 21 November.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-21' } },
  { id: 'V2-CORR-08', language: 'en', promptText: 'Next visit twenty-four eleven twenty twenty-six.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-24' } },
  { id: 'V2-CORR-09', language: 'hi', promptText: 'अगली मुलाक़ात 28 नवंबर।', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-28' } },
  { id: 'V2-CORR-10', language: 'hi', promptText: 'अगली मुलाक़ात परसों।', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-15' } },
  { id: 'V2-CORR-11', language: 'mr', promptText: 'पुढील भेट 27 नोव्हेंबर.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-27' } },
  { id: 'V2-CORR-12', language: 'mr', promptText: 'पुढील भेट उद्या.', expectedCorrection: { field: 'nextVisitDate', oldValue: '2026-11-20', newValue: '2026-11-14' } },

  // Vaccinations due (6: 2 en, 2 hi, 2 mr)
  { id: 'V2-CORR-13', language: 'en', promptText: 'Vaccinations due: Hepatitis B.', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'Hepatitis B' } },
  { id: 'V2-CORR-14', language: 'en', promptText: 'Vaccinations due: Pentavalent and OPV.', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'Pentavalent and OPV' } },
  { id: 'V2-CORR-15', language: 'hi', promptText: 'देय टीके पेंटावेलेंट।', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'Pentavalent' } },
  { id: 'V2-CORR-16', language: 'hi', promptText: 'देय टीके खसरा।', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'Measles' } },
  { id: 'V2-CORR-17', language: 'mr', promptText: 'देय लसी गोवर.', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'Measles' } },
  { id: 'V2-CORR-18', language: 'mr', promptText: 'देय लसी टीटी दोन.', expectedCorrection: { field: 'vaccinationsDue', oldValue: 'None reported', newValue: 'TT2' } },

  // Visit type (6: 2 en, 2 hi, 2 mr)
  { id: 'V2-CORR-19', language: 'en', promptText: 'Visit type is HBYC.', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'HBYC' } },
  { id: 'V2-CORR-20', language: 'en', promptText: 'Change visit type to General.', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'General' } },
  { id: 'V2-CORR-21', language: 'hi', promptText: 'मुलाक़ात का प्रकार PNC।', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'PNC' } },
  { id: 'V2-CORR-22', language: 'hi', promptText: 'मुलाक़ात का प्रकार सामान्य।', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'General' } },
  { id: 'V2-CORR-23', language: 'mr', promptText: 'भेटीचा प्रकार लसीकरण.', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'Immunisation' } },
  { id: 'V2-CORR-24', language: 'mr', promptText: 'भेटीचा प्रकार HBNC.', expectedCorrection: { field: 'visitType', oldValue: 'ANC', newValue: 'HBNC' } },

  // Beneficiary ID (6: 2 en, 2 hi, 2 mr)
  { id: 'V2-CORR-25', language: 'en', promptText: 'Beneficiary ID is BEN-1003.', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1003' } },
  { id: 'V2-CORR-26', language: 'en', promptText: 'Change beneficiary ID to BEN-1005.', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1005' } },
  { id: 'V2-CORR-27', language: 'hi', promptText: 'लाभार्थी ID BEN-1002 है।', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1002' } },
  { id: 'V2-CORR-28', language: 'hi', promptText: 'लाभार्थी आईडी BEN-1004 है।', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1004' } },
  { id: 'V2-CORR-29', language: 'mr', promptText: 'लाभार्थी ID BEN-1003 आहे.', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1003' } },
  { id: 'V2-CORR-30', language: 'mr', promptText: 'लाभार्थी आयडी BEN-1005 आहे.', expectedCorrection: { field: 'beneficiaryId', oldValue: 'BEN-1001', newValue: 'BEN-1005' } },
].map((item, idx) => ({
  ...item,
  fileName: `${item.id}.wav`,
  category: 'correction',
  noiseLevel: noiseFor(idx),
  speaker: speakerFor(idx),
  beneficiaryId: 'BEN-1001',
  beneficiaryKind: 'Pregnant',
  expectedFields: null,
  expectedDangerRuleIds: [],
  expectedNeedsReview: false,
  baseFields: baseNormal,
}));

const v1Utterances = [...normalV1, ...dangerV1, ...negationV1, ...correctionsV1].map((u) => ({
  ...u,
  split: DEV_IDS.has(u.id) ? 'dev' : 'test_v1',
}));

const v2Utterances = [...normalV2, ...dangerV2, ...negationV2, ...correctionsV2].map((u, globalIdx) => ({
  ...u,
  noiseLevel: noiseFor(globalIdx),
  speaker: speakerFor(globalIdx),
  split: 'test_v2',
}));

const utterances = [...v1Utterances, ...v2Utterances];

const devIds = utterances.filter((u) => u.split === 'dev').map((u) => u.id);
const testV1Ids = utterances.filter((u) => u.split === 'test_v1').map((u) => u.id);
const testV2Ids = utterances.filter((u) => u.split === 'test_v2').map((u) => u.id);

if (devIds.length !== 40 || testV1Ids.length !== 40 || testV2Ids.length !== 120) {
  throw new Error(`Unexpected split counts: dev=${devIds.length}, test_v1=${testV1Ids.length}, test_v2=${testV2Ids.length}`);
}

const manifest = {
  version: '3.0',
  referenceDate: '2026-11-13',
  audioSpec: {
    format: 'WAV (uncompressed PCM)',
    encoding: 'signed 16-bit little-endian (pcm_s16le)',
    channels: 1,
    sampleRateHz: 16000,
    frameBytes: 1024,
    frameCadenceMs: 32,
  },
  counts: {
    total: utterances.length,
    dev: devIds.length,
    test_v1: testV1Ids.length,
    test_v2: testV2Ids.length,
    normal: normalV1.length + normalV2.length,
    danger: dangerV1.length + dangerV2.length,
    negation: negationV1.length + negationV2.length,
    correction: correctionsV1.length + correctionsV2.length,
  },
  utterances,
};

const frozenTestV1 = {
  version: '2.1',
  splitName: 'test_v1',
  status: 'seen_regression_only',
  frozenAt: '2026-11-21',
  policy: 'SEEN DATA (Phase 2B synthetic run). Must NEVER be used again as a clean held-out headline metric; regression use only.',
  count: testV1Ids.length,
  sha256: crypto.createHash('sha256').update(JSON.stringify(testV1Ids)).digest('hex'),
  testIds: testV1Ids,
};

const frozenTestV2 = {
  version: '3.0',
  splitName: 'test_v2',
  status: 'unseen_human_held_out',
  frozenAt: '2026-11-21',
  policy: 'FROZEN BEFORE ANY HUMAN RECORDING EXISTS. NEVER run synthetic audio, NEVER tune patterns, normalisation, or danger rules against test_v2 items. Headline METRICS.md numbers come strictly from test_v2 human recordings.',
  count: testV2Ids.length,
  categoryCounts: {
    normal: normalV2.length,
    danger: dangerV2.length,
    correction: correctionsV2.length,
    negation: negationV2.length,
  },
  recordingGuidance: {
    minSpeakers: 2,
    speakerNote: 'At least 2 human speakers (at least one female speaker if possible; alternating speaker-1 and speaker-2 across 60/60 items).',
    noiseMix: '50% clean (60 items), 25% household (30 items), 25% street (30 items).',
  },
  sha256: crypto.createHash('sha256').update(JSON.stringify(testV2Ids)).digest('hex'),
  testV2Ids,
};

const corpusDir = path.resolve(process.cwd(), 'tests/corpus');
fs.mkdirSync(corpusDir, { recursive: true });
fs.writeFileSync(path.join(corpusDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(corpusDir, 'test_split_frozen.json'), JSON.stringify(frozenTestV1, null, 2) + '\n');
fs.writeFileSync(path.join(corpusDir, 'test_v2_frozen.json'), JSON.stringify(frozenTestV2, null, 2) + '\n');

const lines = [
  '# ASHA SAKHI — Gnani Voice Evaluation Script (200 Utterances: 80 Regression + 120 Held-Out `test_v2`)',
  '',
  'This read-aloud corpus evaluates the real **Gnani Prisma v3.0 STT -> normalisation -> extraction / correction / danger-rule** pipeline across English, Hindi, Marathi, and code-mix.',
  '',
  '## Split Integrity & Recording Plan for `test_v2` (Human Held-Out Set)',
  '',
  '- **`dev` (40 items) & `test_v1` (40 items):** Seen during Phase 2 / 2B. **Regression sets only** — never used for headline accuracy claims.',
  `- **\`test_v2\` (120 items, frozen SHA-256: \`${frozenTestV2.sha256}\`):** Completely unseen held-out human-speech evaluation set (**33 normal visits**, **33 danger-sign cases across all 7 rules and all languages**, **30 corrections across all 5 fields**, **24 negation/near-miss/ambiguous cases**). Every headline metric denominator is ≥ 30 (and 24+ negations + 33 normal = 51 quiet utterances for false-alert rate).`,
  '- **Speaker requirement:** Record with **at least 2 human speakers** (at least one female speaker if possible). Alternate `speaker-1` (60 items) and `speaker-2` (60 items) as listed in the `test_v2` tables below.',
  '- **Noise requirement:** At least half (60/120) must be recorded with background noise — **60 `clean` (50%)**, **30 `household` (25%)**, **30 `street` (25%)**.',
  '',
  '## How to Record Audio (Human Recording Instructions)',
  '',
  '1. **Audio format (matching Gnani Prisma v3.0 docs):**',
  '   - Container: **WAV** (`.wav`), uncompressed PCM',
  '   - Encoding: **16-bit signed little-endian (`pcm_s16le`)**',
  '   - Channels: **Mono (1 channel)**',
  '   - Sample rate: **16,000 Hz (16 kHz)**',
  '2. **Where to save & file naming:**',
  '   - Place human recordings in `tests/corpus/audio/` using the exact ID from the tables below, e.g.:',
  '     `tests/corpus/audio/V2-NORM-01.wav`, `tests/corpus/audio/V2-DANG-01.wav`, `tests/corpus/audio/V2-NEG-01.wav`, `tests/corpus/audio/V2-CORR-01.wav`.',
  '3. **Converting phone Voice Memos / QuickTime recordings to exact WAV format:**',
  '   ```sh',
  '   ffmpeg -i raw_recording.m4a -ac 1 -ar 16000 -sample_fmt s16 tests/corpus/audio/V2-NORM-01.wav',
  '   ```',
  '   Batch convert a folder of `.m4a` files:',
  '   ```sh',
  '   mkdir -p tests/corpus/audio',
  '   for f in raw/*.m4a; do base=$(basename "$f" .m4a); ffmpeg -y -i "$f" -ac 1 -ar 16000 -sample_fmt s16 "tests/corpus/audio/${base}.wav"; done',
  '   ```',
  '4. **How to add background noise (`noiseLevel` column):**',
  '   - **`clean`**: Quiet room, phone/mic 15–25 cm from mouth, normal speaking pace with 0.5 s silence before and after.',
  '   - **`household`**: Play a realistic household ambiance track (ceiling fan, distant kitchen/TV chatter) from a second phone/speaker ~1 m away at ~50–55 dB while speaking naturally.',
  '   - **`street`**: Play an Indian street/traffic ambiance track (auto-rickshaw/traffic hum) from a second speaker ~1 m away at ~58–62 dB while holding the recording phone at normal field distance (~20 cm).',
  '   - Keep the noise speaker **behind or beside** the microphone (not blasting directly into the capsule) to mirror field visits.',
  '5. **Run the human held-out evaluation once `test_v2` recordings are placed in `tests/corpus/audio/`:**',
  '   ```sh',
  '   npm run gnani:eval -- --split test_v2',
  '   npm run metrics',
  '   ```',
  '   Against a deployed Vercel URL:',
  '   ```sh',
  '   npm run gnani:eval -- --split test_v2 --base-url https://your-deployment.vercel.app',
  '   ```',
  '',
  '---',
  '',
  '# Part A — Frozen Held-Out Human Evaluation Set: `test_v2` (120 Utterances)',
  '',
  '## A1. `test_v2` Normal Visits (33 utterances: 11 EN/mix, 11 HI, 11 MR)',
  '',
  '| ID | File | Lang | Noise | Speaker | Beneficiary | Script to read aloud | Expected fields |',
  '|---|---|---|---|---|---|---|---|',
  ...v2Utterances.filter((u) => u.category === 'normal').map((u) => {
    const f = u.expectedFields;
    const exp = `ID=${f.beneficiaryId}, Type=${f.visitType}, Wt=${f.weight}, Vax=${f.vaccinationsDue}, Next=${f.nextVisitDate}`;
    return `| ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.speaker} | ${u.beneficiaryId} (${u.beneficiaryKind}) | ${u.promptText} | ${exp} |`;
  }),
  '',
  '## A2. `test_v2` Danger-Sign Utterances (33 utterances: all 7 rules across EN, HI, MR, code-mix)',
  '',
  '| ID | File | Lang | Noise | Speaker | Beneficiary | Script to read aloud | Expected rules |',
  '|---|---|---|---|---|---|---|---|',
  ...v2Utterances.filter((u) => u.category === 'danger').map((u) => `| ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.speaker} | ${u.beneficiaryId} (${u.beneficiaryKind}) | ${u.promptText} | ${u.expectedDangerRuleIds.join(', ')} |`),
  '',
  '## A3. `test_v2` Negation, Near-Miss, and Recall-First Ambiguous Utterances (24 utterances)',
  '',
  '| ID | File | Lang | Noise | Speaker | Beneficiary | Script to read aloud | Expected alert / review |',
  '|---|---|---|---|---|---|---|---|',
  ...v2Utterances.filter((u) => u.category === 'negation').map((u) => {
    const exp = u.expectedDangerRuleIds.length
      ? `${u.expectedDangerRuleIds.join(', ')} (needsReview=${u.expectedNeedsReview})`
      : 'None (quiet)';
    return `| ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.speaker} | ${u.beneficiaryId} (${u.beneficiaryKind}) | ${u.promptText} | ${exp} |`;
  }),
  '',
  '## A4. `test_v2` Voice Corrections (30 utterances: 6 per field across EN, HI, MR)',
  '',
  'Base fields for every correction: `BEN-1001`, `ANC`, `55 kg`, `None reported`, `2026-11-20`.',
  '',
  '| ID | File | Lang | Noise | Speaker | Script to read aloud | Expected field change |',
  '|---|---|---|---|---|---|---|',
  ...v2Utterances.filter((u) => u.category === 'correction').map((u) => `| ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.speaker} | ${u.promptText} | \`${u.expectedCorrection.field}\`: ${u.expectedCorrection.oldValue} → ${u.expectedCorrection.newValue} |`),
  '',
  '---',
  '',
  '# Part B — Seen Regression Corpus: `dev` (40) + `test_v1` (40)',
  '',
  '## B1. Normal Visits (24 utterances)',
  '',
  '| Split | ID | File | Lang | Noise | Beneficiary | Script to read aloud | Expected fields |',
  '|---|---|---|---|---|---|---|---|',
  ...normalV1.map((u) => {
    const f = u.expectedFields;
    const exp = `ID=${f.beneficiaryId}, Type=${f.visitType}, Wt=${f.weight}, Vax=${f.vaccinationsDue}, Next=${f.nextVisitDate}`;
    return `| ${DEV_IDS.has(u.id) ? 'dev' : 'test_v1'} | ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.beneficiaryId} (${u.beneficiaryKind}) | ${u.promptText} | ${exp} |`;
  }),
  '',
  '## B2. Danger-Sign Utterances (24 utterances)',
  '',
  '| Split | ID | File | Lang | Noise | Beneficiary | Script to read aloud | Expected rules |',
  '|---|---|---|---|---|---|---|---|',
  ...dangerV1.map((u) => `| ${DEV_IDS.has(u.id) ? 'dev' : 'test_v1'} | ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.beneficiaryId} (${u.beneficiaryKind}) | ${u.promptText} | ${u.expectedDangerRuleIds.join(', ')} |`),
  '',
  '## B3. Negation, Near-Miss, and Ambiguous Utterances (16 utterances)',
  '',
  '| Split | ID | File | Lang | Noise | Beneficiary | Script to read aloud | Expected alert / review |',
  '|---|---|---|---|---|---|---|---|',
  ...negationV1.map((u) => {
    const exp = u.expectedDangerRuleIds.length
      ? `${u.expectedDangerRuleIds.join(', ')} (needsReview=${u.expectedNeedsReview})`
      : 'None (quiet)';
    return `| ${DEV_IDS.has(u.id) ? 'dev' : 'test_v1'} | ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.beneficiaryId} (${u.beneficiaryKind}) | ${u.promptText} | ${exp} |`;
  }),
  '',
  '## B4. Voice Corrections (16 utterances)',
  '',
  '| Split | ID | File | Lang | Noise | Script to read aloud | Expected field change |',
  '|---|---|---|---|---|---|---|',
  ...correctionsV1.map((u) => `| ${DEV_IDS.has(u.id) ? 'dev' : 'test_v1'} | ${u.id} | \`${u.fileName}\` | ${u.language} | ${u.noiseLevel} | ${u.promptText} | \`${u.expectedCorrection.field}\`: ${u.expectedCorrection.oldValue} → ${u.expectedCorrection.newValue} |`),
  '',
];

fs.writeFileSync(path.join(corpusDir, 'SCRIPT.md'), lines.join('\n'));
console.log(`Generated ${utterances.length} corpus entries (dev=${devIds.length}, test_v1=${testV1Ids.length}, test_v2=${testV2Ids.length}, test_v2 sha256=${frozenTestV2.sha256})`);
