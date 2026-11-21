import type { Language } from '../domain/types';

export type LandingCopy = {
  navHowItWorks: string;
  navSafety: string;
  navFaq: string;
  navLogin: string;
  navGetStarted: string;
  heroBadge: string;
  heroTitle: string;
  heroSubhead: string;
  heroTagline: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  mockupLabel: string;
  mockupTranscriptTitle: string;
  mockupTranscriptText: string;
  mockupSavedChip: string;
  trustStrip: string;
  problemEyebrow: string;
  problemTitle: string;
  problemCards: Array<{ title: string; body: string }>;
  howEyebrow: string;
  howTitle: string;
  howSteps: Array<{ step: string; title: string; body: string; caption: string }>;
  safetyEyebrow: string;
  safetyTitle: string;
  safetyBody: string;
  safetyPoints: string[];
  safetyMockBadge: string;
  safetyMockRule: string;
  safetyMockMessage: string;
  safetyMockAction: string;
  langEyebrow: string;
  langTitle: string;
  langSubtitle: string;
  langSamples: Record<Language, { label: string; sample: string; note: string }>;
  fieldEyebrow: string;
  fieldTitle: string;
  fieldCards: Array<{ title: string; body: string }>;
  faqEyebrow: string;
  faqTitle: string;
  faqs: Array<{ q: string; a: string }>;
  ctaTitle: string;
  ctaSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  footerPrivacy: string;
  footerLimitations: string;
  footerGithub: string;
  footerContact: string;
  footerSyntheticNote: string;
  nativeReviewNote?: string;
};

export const landingCopy: Record<Language, LandingCopy> = {
  en: {
    navHowItWorks: 'How it works',
    navSafety: 'Safety',
    navFaq: 'FAQ',
    navLogin: 'Log in',
    navGetStarted: 'Get started',
    heroBadge: 'Prototype · Synthetic demo data',
    heroTitle: 'Speak the visit. We write the record.',
    heroSubhead:
      'A voice-first visit register for ASHA workers in Marathi, Hindi and English, with built-in danger-sign alerts.',
    heroTagline: 'Your Voice. Your Community. Better Healthcare.',
    heroPrimaryCta: 'Try the live demo',
    heroSecondaryCta: 'Create worker account',
    mockupLabel: 'Simulated preview',
    mockupTranscriptTitle: 'Live voice capture',
    mockupTranscriptText: 'Sunita ANC follow-up, weight 55 kg, next visit 20 November.',
    mockupSavedChip: 'Confirmed & saved',
    trustStrip:
      'Prototype · Synthetic data only · Not a medical device · Powered by Gnani Prisma and Timbre voice AI',
    problemEyebrow: 'The problem',
    problemTitle: 'Field visits are verbal. Registers are still paper and tiny keyboards.',
    problemCards: [
      {
        title: 'Typing on small screens',
        body: 'Filling multi-field maternal and newborn forms on a 390 px phone during a home visit slows workers down and pulls focus away from the family.',
      },
      {
        title: 'Local languages and code-mix',
        body: 'Workers naturally mix Marathi, Hindi, and clinical English terms like ANC, kg, and TT1 — standard forms force rigid manual entry.',
      },
      {
        title: 'Late or incomplete records',
        body: 'When notes wait until evening, weights, follow-up dates, and urgent danger signs are easy to miss or transcribe inconsistently.',
      },
    ],
    howEyebrow: 'How it works',
    howTitle: 'Four calm steps from spoken note to confirmed record',
    howSteps: [
      {
        step: '01',
        title: 'Speak',
        body: 'Tap the microphone and describe the home visit naturally in Marathi, Hindi, or English.',
        caption: 'Gnani Prisma v3.0 streams your spoken visit note.',
      },
      {
        step: '02',
        title: 'Check (read-back)',
        body: 'ASHA SAKHI fills the five visit fields and reads the summary back aloud with Gnani Timbre v3.0.',
        caption: 'Beneficiary ID, Visit type, Weight, Vaccinations due, Next visit date.',
      },
      {
        step: '03',
        title: 'Correct by voice',
        body: 'Fix any single field by voice or keyboard ("No, weight is 56 kilo") while keeping full change history.',
        caption: 'Every edit records old value, new value, and timestamp.',
      },
      {
        step: '04',
        title: 'Save and follow up',
        body: 'Nothing is saved until you tap Confirm. Follow-up dates and danger-sign referrals stay linked.',
        caption: 'Protected per-worker storage with immutable audit logs.',
      },
    ],
    safetyEyebrow: 'Safety by design',
    safetyTitle: 'Fixed MoHFW danger-sign rules — never AI guesswork.',
    safetyBody:
      'ASHA SAKHI checks spoken notes against a fixed, versioned list of published MoHFW pregnancy and newborn danger signs. Alerts interrupt before read-back so urgent referrals are never buried.',
    safetyPoints: [
      'Predefined danger signs come from published MoHFW guidelines, decided by fixed rules — not generative AI.',
      'A human worker reviews and confirms every single record before it is saved.',
      'No clinical diagnosis, no treatment advice, and no automated triage decisions.',
      'Includes a visible "Heard:" transcript check and a one-tap manual "Danger sign?" safety net.',
    ],
    safetyMockBadge: 'PREG-01 · Fixed rule',
    safetyMockRule: 'Bleeding during pregnancy',
    safetyMockMessage: 'A predefined danger sign was reported. Referral support is recommended.',
    safetyMockAction: 'Show nearest PHC (Sample facility)',
    langEyebrow: 'Your language',
    langTitle: 'Built for Marathi, Hindi, English, and natural code-mix',
    langSubtitle: 'Switch the interface, read-back voice, and danger alerts between three languages at any time.',
    langSamples: {
      en: {
        label: 'English / Code-mix',
        sample: '“Today ANC follow-up for Sunita, weight 55 kg, TT1 due, next visit 20 November.”',
        note: 'Extracts structured fields while keeping clinical abbreviations intact.',
      },
      hi: {
        label: 'हिंदी (Hindi)',
        sample: '“आज सुनीता की एएनसी विज़िट हुई, वजन 55 किलो है, अगली मुलाकात 20 नवंबर।”',
        note: 'Supports Devanagari numerals, spoken dates, and Hindi danger-sign phrasing.',
      },
      mr: {
        label: 'मराठी (Marathi)',
        sample: '“आज मी सुनीताची एएनसी भेट घेतली, वजन ५५ किलो, पुढची भेट २० नोव्हेंबर.”',
        note: 'Designed for spoken Marathi and Marathi-English code-mixed visit notes.',
      },
    },
    fieldEyebrow: 'Built for the field',
    fieldTitle: 'Practical resilience for real mobile visits',
    fieldCards: [
      {
        title: 'Noise-aware voice capture',
        body: 'Streamed 16 kHz mono audio with echo cancellation, automatic reconnects, and a one-tap typed fallback whenever speech is unclear.',
      },
      {
        title: 'Quick single-field correction',
        body: 'Fix weight, visit type, vaccinations, or follow-up date without re-speaking the entire visit, with audited correction history.',
      },
      {
        title: 'Offline drafts when signal drops',
        body: 'Confirmed visits queue safely in IndexedDB and sync when back online. Voice capture needs an internet connection; typed entry works offline.',
      },
      {
        title: 'Village coverage map (sample data)',
        body: 'Visualise completed households and the nearest sample PHC facility on a lightweight lazy-loaded map using clearly labelled sample geography.',
      },
    ],
    faqEyebrow: 'FAQ',
    faqTitle: 'Honest answers before you start',
    faqs: [
      {
        q: 'Is this a medical device?',
        a: 'No. ASHA SAKHI is a documentation and workflow prototype. It does not diagnose conditions, prescribe treatment, or replace clinical judgment or emergency services.',
      },
      {
        q: 'Does it store real patient data?',
        a: 'No. Every account and demo workspace uses synthetic demo beneficiaries only. Users must confirm at sign-up that they will not enter real patient information.',
      },
      {
        q: 'Does it work offline?',
        a: 'Partially. You can view cached records, type visit notes, and save drafts to the device offline draft queue, which syncs when connectivity returns. Live voice capture (Gnani Prisma) requires an internet connection.',
      },
      {
        q: 'Which languages are supported?',
        a: 'English, Hindi (हिंदी), and Marathi (मराठी) across the UI, spoken read-back, danger-sign alerts, and code-mixed speech extraction.',
      },
      {
        q: 'Who can see my data?',
        a: 'Every table is protected by Supabase Postgres Row-Level Security (RLS). Workers can read and write only their own area-scoped synthetic records. Supervisors see only aggregated area counts and referral rows — never raw transcripts.',
      },
    ],
    ctaTitle: 'Try the full voice visit workflow in seconds',
    ctaSubtitle: 'Start an isolated anonymous demo sandbox with five synthetic beneficiaries, or create your own worker account.',
    ctaPrimary: 'Try the live demo',
    ctaSecondary: 'Create worker account',
    footerPrivacy: 'Privacy',
    footerLimitations: 'Limitations',
    footerGithub: 'GitHub',
    footerContact: 'Contact',
    footerSyntheticNote: 'Synthetic demo data · Prototype only · Not a medical device or government system.',
  },
  // NATIVE_REVIEW_NEEDED: Hindi landing copy — mark for native speaker review before production release.
  hi: {
    navHowItWorks: 'यह कैसे काम करता है',
    navSafety: 'सुरक्षा',
    navFaq: 'सवाल-जवाब',
    navLogin: 'लॉग इन',
    navGetStarted: 'शुरू करें',
    heroBadge: 'प्रोटोटाइप · सिंथेटिक डेमो डेटा',
    heroTitle: 'विज़िट बोलें। हम रिकॉर्ड लिखते हैं।',
    heroSubhead:
      'मराठी, हिंदी और अंग्रेज़ी में आशा कार्यकर्ताओं के लिए आवाज़-आधारित विज़िट रजिस्टर, अंतर्निहित खतरे के संकेत अलर्ट के साथ।',
    heroTagline: 'आपकी आवाज़। आपका समुदाय। बेहतर स्वास्थ्य सेवा।',
    heroPrimaryCta: 'लाइव डेमो आज़माएँ',
    heroSecondaryCta: 'कार्यकर्ता खाता बनाएँ',
    mockupLabel: 'सिम्युलेटेड प्रीव्यू',
    mockupTranscriptTitle: 'लाइव वॉइस कैप्चर',
    mockupTranscriptText: 'सुनीता एएनसी फॉलो-अप, वजन 55 किलो, अगली मुलाकात 20 नवंबर।',
    mockupSavedChip: 'पुष्टि और सहेजा गया',
    trustStrip:
      'प्रोटोटाइप · केवल सिंथेटिक डेटा · चिकित्सा उपकरण नहीं · Gnani Prisma और Timbre वॉइस AI द्वारा संचालित',
    problemEyebrow: 'समस्या',
    problemTitle: 'फ़ील्ड विज़िट बोलकर होती हैं। रजिस्टर अभी भी कागज़ और छोटे कीबोर्ड पर हैं।',
    problemCards: [
      {
        title: 'छोटी स्क्रीन पर टाइपिंग',
        body: 'गृह भेंट के दौरान 390 px फ़ोन पर कई फ़ील्ड भरना काम धीमा करता है और परिवार से ध्यान हटाता है।',
      },
      {
        title: 'स्थानीय भाषाएँ और कोड-मिक्स',
        body: 'कार्यकर्ता स्वाभाविक रूप से मराठी, हिंदी और ANC, kg, TT1 जैसे शब्द मिलाकर बोलते हैं — सामान्य फ़ॉर्म इसे नहीं समझते।',
      },
      {
        title: 'देरी या अधूरे रिकॉर्ड',
        body: 'शाम तक इंतज़ार करने से वजन, अगली तारीख और खतरे के संकेत छूटने की संभावना बढ़ जाती है।',
      },
    ],
    howEyebrow: 'यह कैसे काम करता है',
    howTitle: 'बोले गए नोट से पक्के रिकॉर्ड तक चार सरल चरण',
    howSteps: [
      {
        step: '01',
        title: 'बोलें',
        body: 'माइक्रोफ़ोन दबाएँ और मराठी, हिंदी या अंग्रेज़ी में गृह भेंट का विवरण स्वाभाविक रूप से बोलें।',
        caption: 'Gnani Prisma v3.0 आपका बोला हुआ नोट स्ट्रीम करता है।',
      },
      {
        step: '02',
        title: 'जाँचें (सुनकर)',
        body: 'ASHA SAKHI पाँच विज़िट फ़ील्ड भरता है और Gnani Timbre v3.0 से सारांश पढ़कर सुनाता है।',
        caption: 'लाभार्थी आईडी, विज़िट प्रकार, वजन, देय टीके, अगली मुलाकात।',
      },
      {
        step: '03',
        title: 'आवाज़ से सुधारें',
        body: 'पूरे इतिहास के साथ किसी एक फ़ील्ड को आवाज़ या टाइप करके तुरंत सुधारें ("नहीं, वजन 56 किलो है")।',
        caption: 'हर सुधार पुराना मान, नया मान और समय दर्ज करता है।',
      },
      {
        step: '04',
        title: 'सहेजें और फॉलो-अप करें',
        body: 'आपके "पुष्टि करें" दबाए बिना कुछ भी सहेजा नहीं जाता। फॉलो-अप और रेफ़रल स्वतः जुड़े रहते हैं।',
        caption: 'ऑडिट लॉग के साथ सुरक्षित कार्यकर्ता-स्तरीय स्टोरेज।',
      },
    ],
    safetyEyebrow: 'सुरक्षा सबसे पहले',
    safetyTitle: 'MoHFW के तय नियम — AI का अंदाज़ा नहीं।',
    safetyBody:
      'ASHA SAKHI बोले गए नोट की जाँच प्रकाशित MoHFW गर्भावस्था और नवजात खतरे के संकेतों के तय नियमों से करता है। अलर्ट रीड-बैक से पहले दिखता है।',
    safetyPoints: [
      'खतरे के संकेत प्रकाशित MoHFW दिशानिर्देशों के तय नियमों से तय होते हैं, AI अनुमान से नहीं।',
      'सहेजने से पहले हर रिकॉर्ड की पुष्टि कार्यकर्ता स्वयं करता है।',
      'कोई चिकित्सीय निदान या उपचार सलाह नहीं।',
      'दृश्य "सुना गया:" लाइन और एक-टैप मैनुअल "खतरे का संकेत?" शॉर्टकट शामिल।',
    ],
    safetyMockBadge: 'PREG-01 · तय नियम',
    safetyMockRule: 'गर्भावस्था में रक्तस्राव',
    safetyMockMessage: 'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    safetyMockAction: 'नज़दीकी PHC दिखाएँ (नमूना सुविधा)',
    langEyebrow: 'आपकी भाषा',
    langTitle: 'मराठी, हिंदी, अंग्रेज़ी और स्वाभाविक कोड-मिक्स के लिए निर्मित',
    langSubtitle: 'किसी भी समय इंटरफ़ेस, वॉइस रीड-बैक और अलर्ट को तीनों भाषाओं में बदलें।',
    langSamples: {
      en: {
        label: 'English / Code-mix',
        sample: '“Today ANC follow-up for Sunita, weight 55 kg, TT1 due, next visit 20 November.”',
        note: 'क्लीनिकल संक्षिप्त नाम सुरक्षित रखते हुए फ़ील्ड भरता है।',
      },
      hi: {
        label: 'हिंदी (Hindi)',
        sample: '“आज सुनीता की एएनसी विज़िट हुई, वजन 55 किलो है, अगली मुलाकात 20 नवंबर।”',
        note: 'देवनागरी संख्या, बोली गई तारीख और हिंदी खतरे के संकेतों का समर्थन।',
      },
      mr: {
        label: 'मराठी (Marathi)',
        sample: '“आज मी सुनीताची एएनसी भेट घेतली, वजन ५५ किलो, पुढची भेट २० नोव्हेंबर.”',
        note: 'बोली जाने वाली मराठी और मराठी-अंग्रेज़ी कोड-मिक्स के लिए।',
      },
    },
    fieldEyebrow: 'फ़ील्ड के लिए निर्मित',
    fieldTitle: 'मोबाइल गृह भेंट के लिए व्यावहारिक भरोसा',
    fieldCards: [
      {
        title: 'शोर-सजग वॉइस कैप्चर',
        body: '16 kHz मोनो ऑडियो, स्वतः रीकनेक्ट और आवाज़ स्पष्ट न होने पर तुरंत टाइप करने का विकल्प।',
      },
      {
        title: 'तेज़ एकल-फ़ील्ड सुधार',
        body: 'पूरी विज़िट दोबारा बोले बिना वजन, टीका या तारीख सुधारें, पूरे ऑडिट इतिहास के साथ।',
      },
      {
        title: 'नेटवर्क न होने पर ऑफ़लाइन ड्राफ़्ट',
        body: 'ड्राफ़्ट डिवाइस पर सुरक्षित रहते हैं और नेटवर्क आने पर सिंक होते हैं। वॉइस कैप्चर के लिए इंटरनेट ज़रूरी है; टाइप किया गया प्रवेश ऑफ़लाइन काम करता है।',
      },
      {
        title: 'गाँव कवरेज नक्शा (नमूना डेटा)',
        body: 'नमूना भौगोलिक डेटा पर पूरे हुए घर और नज़दीकी नमूना PHC देखें।',
      },
    ],
    faqEyebrow: 'सवाल-जवाब',
    faqTitle: 'शुरू करने से पहले स्पष्ट जानकारी',
    faqs: [
      {
        q: 'क्या यह चिकित्सा उपकरण है?',
        a: 'नहीं। ASHA SAKHI एक प्रलेखन प्रोटोटाइप है। यह निदान या उपचार की सलाह नहीं देता।',
      },
      {
        q: 'क्या इसमें वास्तविक मरीज़ों का डेटा सहेजा जाता है?',
        a: 'नहीं। केवल सिंथेटिक डेमो लाभार्थियों का उपयोग होता है। साइन-अप पर सहमति अनिवार्य है कि वास्तविक मरीज़ डेटा दर्ज नहीं किया जाएगा।',
      },
      {
        q: 'क्या यह ऑफ़लाइन काम करता है?',
        a: 'आंशिक रूप से। ऑफ़लाइन टाइप किए गए विज़िट ड्राफ़्ट डिवाइस पर सहेजे जाते हैं और नेटवर्क आने पर सिंक होते हैं। लाइव वॉइस कैप्चर के लिए इंटरनेट आवश्यक है।',
      },
      {
        q: 'कौन-सी भाषाएँ समर्थित हैं?',
        a: 'अंग्रेज़ी, हिंदी और मराठी — यूआई, वॉइस रीड-बैक और खतरे के संकेत अलर्ट में।',
      },
      {
        q: 'मेरा डेटा कौन देख सकता है?',
        a: 'हर तालिका Supabase Postgres Row-Level Security (RLS) से सुरक्षित है। कार्यकर्ता केवल अपने क्षेत्र का सिंथेटिक डेटा देखते हैं। पर्यवेक्षक केवल कुल संख्या और रेफ़रल देखते हैं — कच्चा ट्रांसक्रिप्ट कभी नहीं।',
      },
    ],
    ctaTitle: 'सेकंडों में पूरा वॉइस विज़िट प्रवाह आज़माएँ',
    ctaSubtitle: 'पाँच सिंथेटिक लाभार्थियों के साथ अलग डेमो सैंडबॉक्स शुरू करें या अपना कार्यकर्ता खाता बनाएँ।',
    ctaPrimary: 'लाइव डेमो आज़माएँ',
    ctaSecondary: 'कार्यकर्ता खाता बनाएँ',
    footerPrivacy: 'गोपनीयता',
    footerLimitations: 'सीमाएँ',
    footerGithub: 'GitHub',
    footerContact: 'संपर्क',
    footerSyntheticNote: 'सिंथेटिक डेमो डेटा · केवल प्रोटोटाइप · चिकित्सा उपकरण या सरकारी प्रणाली नहीं।',
    nativeReviewNote: 'हिंदी पाठ मूल भाषी समीक्षा के लिए चिह्नित है।',
  },
  // NATIVE_REVIEW_NEEDED: Marathi landing copy — mark for native speaker review before production release.
  mr: {
    navHowItWorks: 'हे कसे कार्य करते',
    navSafety: 'सुरक्षितता',
    navFaq: 'प्रश्नोत्तरे',
    navLogin: 'लॉग इन',
    navGetStarted: 'सुरू करा',
    heroBadge: 'प्रोटोटाइप · नमुना डेमो डेटा',
    heroTitle: 'भेट बोला. आम्ही नोंद लिहितो.',
    heroSubhead:
      'मराठी, हिंदी आणि इंग्रजीमध्ये आशा कार्यकर्त्यांसाठी आवाज-आधारित भेट नोंदवही, अंगभूत धोक्याच्या लक्षण अलर्टसह.',
    heroTagline: 'तुमचा आवाज. तुमचा समुदाय. उत्तम आरोग्यसेवा.',
    heroPrimaryCta: 'लाइव्ह डेमो वापरा',
    heroSecondaryCta: 'कार्यकर्ता खाते तयार करा',
    mockupLabel: 'सिम्युलेटेड प्रीव्ह्यू',
    mockupTranscriptTitle: 'थेट आवाज नोंद',
    mockupTranscriptText: 'सुनीता एएनसी फॉलो-अप, वजन ५५ किलो, पुढची भेट २० नोव्हेंबर.',
    mockupSavedChip: 'पुष्टी व जतन केले',
    trustStrip:
      'प्रोटोटाइप · फक्त नमुना डेटा · वैद्यकीय उपकरण नाही · Gnani Prisma आणि Timbre वॉइस AI द्वारे समर्थित',
    problemEyebrow: 'समस्या',
    problemTitle: 'गृहभेटी तोंडी होतात. नोंदी अजूनही कागद आणि लहान कीबोर्डवर आहेत.',
    problemCards: [
      {
        title: 'लहान स्क्रीनवर टायपिंग',
        body: 'गृहभेटीदरम्यान 390 px फोनवर अनेक रकाने भरणे काम संथ करते आणि कुटुंबावरील लक्ष विचलित करते.',
      },
      {
        title: 'स्थानिक भाषा आणि कोड-मिक्स',
        body: 'कार्यकर्त्या मराठी, हिंदी आणि ANC, kg, TT1 यांसारखे शब्द मिसळून बोलतात — साधे फॉर्म हे समजत नाहीत.',
      },
      {
        title: 'उशिरा किंवा अपूर्ण नोंदी',
        body: 'संध्याकाळपर्यंत वाट पाहिल्यास वजन, पुढील तारीख आणि धोक्याची लक्षणे सुटण्याची शक्यता असते.',
      },
    ],
    howEyebrow: 'हे कसे कार्य करते',
    howTitle: 'बोललेल्या नोंदीपासून पक्क्या रेकॉर्डपर्यंत चार सोपे टप्पे',
    howSteps: [
      {
        step: '01',
        title: 'बोला',
        body: 'मायक्रोफोन दाबा आणि मराठी, हिंदी किंवा इंग्रजीमध्ये गृहभेटीचा तपशील नैसर्गिकरीत्या बोला.',
        caption: 'Gnani Prisma v3.0 तुमची बोललेली नोंद स्ट्रीम करते.',
      },
      {
        step: '02',
        title: 'तपासा (ऐकून)',
        body: 'ASHA SAKHI पाच रकाने भरते आणि Gnani Timbre v3.0 मधून सारांश वाचून दाखवते.',
        caption: 'लाभार्थी आयडी, भेटीचा प्रकार, वजन, लसीकरण, पुढील भेट तारीख.',
      },
      {
        step: '03',
        title: 'आवाजाने दुरुस्त करा',
        body: 'संपूर्ण बदलाच्या इतिहासासह कोणताही एक रकाना आवाजाने किंवा टायपिंगने दुरुस्त करा.',
        caption: 'प्रत्येक दुरुस्तीत जुने मूल्य, नवे मूल्य आणि वेळ नोंदवली जाते.',
      },
      {
        step: '04',
        title: 'जतन करा आणि पाठपुरावा',
        body: 'तुम्ही पुष्टी करेपर्यंत काहीही जतन होत नाही. पाठपुरावा आणि रेफरल आपोआप जोडले जातात.',
        caption: 'ऑडिट लॉगसह सुरक्षित कार्यकर्ता-स्तरीय साठवणूक.',
      },
    ],
    safetyEyebrow: 'सुरक्षितता प्रथम',
    safetyTitle: 'MoHFW चे ठराविक नियम — AI अंदाज नाही.',
    safetyBody:
      'ASHA SAKHI बोललेली नोंद प्रकाशित MoHFW गर्भधारणा व नवजात धोक्याच्या लक्षणांच्या ठराविक नियमांशी तपासते. अलर्ट रीड-बॅकपूर्वी दिसतो.',
    safetyPoints: [
      'धोक्याची लक्षणे प्रकाशित MoHFW मार्गदर्शक तत्त्वांवर आधारित ठराविक नियमांनी ठरवली जातात.',
      'जतन करण्यापूर्वी प्रत्येक नोंदीची पुष्टी कार्यकर्ता स्वतः करतो.',
      'कोणतेही वैद्यकीय निदान किंवा उपचार सल्ला दिला जात नाही.',
      'दृश्य "ऐकले:" ओळ आणि एक-टॅप मॅन्युअल "धोक्याचे लक्षण?" शॉर्टकट समाविष्ट.',
    ],
    safetyMockBadge: 'PREG-01 · ठराविक नियम',
    safetyMockRule: 'गर्भधारणेदरम्यान रक्तस्राव',
    safetyMockMessage: 'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    safetyMockAction: 'जवळचे PHC दाखवा (नमुना सुविधा)',
    langEyebrow: 'तुमची भाषा',
    langTitle: 'मराठी, हिंदी, इंग्रजी आणि नैसर्गिक कोड-मिक्ससाठी तयार',
    langSubtitle: 'कधीही इंटरफेस, आवाज वाचन आणि धोक्याचे अलर्ट तीन भाषांमध्ये बदला.',
    langSamples: {
      en: {
        label: 'English / Code-mix',
        sample: '“Today ANC follow-up for Sunita, weight 55 kg, TT1 due, next visit 20 November.”',
        note: 'वैद्यकीय संक्षेप जपून रकाने अचूक भरते.',
      },
      hi: {
        label: 'हिंदी (Hindi)',
        sample: '“आज सुनीता की एएनसी विज़िट हुई, वजन 55 किलो है, अगली मुलाकात 20 नवंबर।”',
        note: 'देवनागरी अंक, बोललेल्या तारखा आणि हिंदी धोक्याच्या लक्षणांसाठी.',
      },
      mr: {
        label: 'मराठी (Marathi)',
        sample: '“आज मी सुनीताची एएनसी भेट घेतली, वजन ५५ किलो, पुढची भेट २० नोव्हेंबर.”',
        note: 'मराठी आणि मराठी-इंग्रजी मिश्र बोलण्यासाठी तयार.',
      },
    },
    fieldEyebrow: 'क्षेत्रासाठी तयार',
    fieldTitle: 'प्रत्यक्ष मोबाईल भेटींसाठी विश्वासार्ह रचना',
    fieldCards: [
      {
        title: 'गोंगाटातही स्पष्ट आवाज नोंद',
        body: '16 kHz मोनो ऑडिओ, स्वयंचलित रीकनेक्ट आणि आवाज अस्पष्ट असल्यास त्वरित टाइप करण्याचा पर्याय.',
      },
      {
        title: 'त्वरित एक-रकाना दुरुस्ती',
        body: 'संपूर्ण भेट पुन्हा न बोलता वजन, लस किंवा तारीख दुरुस्त करा, पूर्ण इतिहासासह.',
      },
      {
        title: 'नेटवर्क नसताना ऑफलाइन मसुदे',
        body: 'मसुदे डिव्हाइसवर सुरक्षित राहतात आणि नेटवर्क आल्यावर सिंक होतात. आवाज नोंदीसाठी इंटरनेट आवश्यक आहे; टाइप केलेली नोंद ऑफलाइन चालते.',
      },
      {
        title: 'गाव कव्हरेज नकाशा (नमुना डेटा)',
        body: 'नमुना भौगोलिक डेटावर पूर्ण घरे आणि जवळचे नमुना PHC पहा.',
      },
    ],
    faqEyebrow: 'प्रश्नोत्तरे',
    faqTitle: 'सुरू करण्यापूर्वी प्रामाणिक उत्तरे',
    faqs: [
      {
        q: 'हे वैद्यकीय उपकरण आहे का?',
        a: 'नाही. ASHA SAKHI हा दस्तऐवजीकरण प्रोटोटाइप आहे. हे निदान किंवा उपचार सल्ला देत नाही.',
      },
      {
        q: 'यात खऱ्या रुग्णांचा डेटा साठवला जातो का?',
        a: 'नाही. केवळ नमुना (सिंथेटिक) लाभार्थी वापरले जातात. साइन-अप करताना खऱ्या रुग्णांची माहिती न भरण्याची संमती बंधनकारक आहे.',
      },
      {
        q: 'हे ऑफलाइन चालते का?',
        a: 'अंशतः. ऑफलाइन टाइप केलेले भेट मसुदे डिव्हाइसवर जतन होतात आणि नेटवर्क आल्यावर सिंक होतात. थेट आवाज नोंदीसाठी इंटरनेट आवश्यक आहे.',
      },
      {
        q: 'कोणत्या भाषा समर्थित आहेत?',
        a: 'इंग्रजी, हिंदी आणि मराठी — इंटरफेस, आवाज वाचन आणि धोक्याच्या अलर्टसाठी.',
      },
      {
        q: 'माझा डेटा कोण पाहू शकतो?',
        a: 'प्रत्येक टेबल Supabase Postgres Row-Level Security (RLS) ने संरक्षित आहे. कार्यकर्त्या फक्त स्वतःच्या क्षेत्राचा नमुना डेटा पाहू शकतात. पर्यवेक्षक केवळ एकत्रित आकडेवारी व रेफरल पाहतात — थेट ट्रांसक्रिप्ट कधीही नाही.',
      },
    ],
    ctaTitle: 'काही सेकंदांत संपूर्ण आवाज भेट प्रक्रिया अनुभवा',
    ctaSubtitle: 'पाच नमुना लाभार्थ्यांसह वेगळा डेमो सँडबॉक्स सुरू करा किंवा तुमचे कार्यकर्ता खाते तयार करा.',
    ctaPrimary: 'लाइव्ह डेमो वापरा',
    ctaSecondary: 'कार्यकर्ता खाते तयार करा',
    footerPrivacy: 'गोपनीयता',
    footerLimitations: 'मर्यादा',
    footerGithub: 'GitHub',
    footerContact: 'संपर्क',
    footerSyntheticNote: 'नमुना डेमो डेटा · फक्त प्रोटोटाइप · वैद्यकीय उपकरण किंवा सरकारी प्रणाली नाही.',
    nativeReviewNote: 'मराठी मजकूर स्थानिक भाषिक पुनरावलोकनासाठी चिन्हांकित आहे.',
  },
};
