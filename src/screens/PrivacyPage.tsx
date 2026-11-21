import { ArrowLeft, Database, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { RouterLink } from '../router';
import { useAppStore } from '../store/useAppStore';
import type { Language } from '../domain/types';

const privacyCopy: Record<
  Language,
  {
    backHome: string;
    title: string;
    intro: string;
    cards: Array<{ heading: string; body: string }>;
  }
> = {
  en: {
    backHome: 'Back to ASHA SAKHI',
    title: 'Privacy & Data Handling',
    intro: 'ASHA SAKHI is a research and hackathon prototype built strictly for synthetic demo data. Do not enter real patient names, phone numbers, or clinical records.',
    cards: [
      {
        heading: 'What we store about worker accounts',
        body: 'When you sign up, we store your email address (via Supabase Auth), display name, chosen sample area, preferred language, and consent timestamp. Anonymous demo sessions store no email or password and are automatically deleted after 7 days.',
      },
      {
        heading: 'Synthetic patient data only — zero audio stored',
        body: 'All beneficiaries, villages, and PHC facilities are synthetic demo records tagged synthetic=true. Live speech audio is streamed directly to Gnani Prisma for transcription and is never saved to disk or Postgres. Only structured visit fields, correction history, and a short danger-sign excerpt (max 240 chars) on referrals are persisted.',
      },
      {
        heading: 'Row-Level Security & audit logs',
        body: 'Every database table enforces Supabase Postgres Row-Level Security (RLS). Workers can read and write only their own area-scoped rows. Supervisors see aggregated counts and area referrals only — never raw transcripts. Database triggers record every write into an append-only audit log.',
      },
      {
        heading: 'Retention and instant account deletion',
        body: 'Anonymous demo accounts and their cloned workspace rows expire and are deleted after 7 days. Signed-in workers can permanently delete their profile and all associated visit, follow-up, and referral rows at any time from Settings → Delete account.',
      },
    ],
  },
  hi: {
    backHome: 'ASHA SAKHI पर वापस जाएँ',
    title: 'गोपनीयता और डेटा नीति',
    intro: 'ASHA SAKHI केवल सिंथेटिक डेमो डेटा के लिए बनाया गया एक प्रोटोटाइप है। कृपया वास्तविक मरीज़ों का नाम, फ़ोन या चिकित्सीय जानकारी दर्ज न करें।',
    cards: [
      {
        heading: 'कार्यकर्ता खाते के बारे में क्या सहेजा जाता है',
        body: 'साइन-अप पर आपका ईमेल (Supabase Auth), प्रदर्शन नाम, चुना गया नमूना क्षेत्र, पसंदीदा भाषा और सहमति समय सहेजा जाता है। अनाम डेमो सत्र 7 दिनों के बाद स्वतः हटा दिए जाते हैं।',
      },
      {
        heading: 'केवल सिंथेटिक डेटा — कोई ऑडियो सहेजा नहीं जाता',
        body: 'सभी लाभार्थी और सुविधाएँ सिंथेटिक हैं। ऑडियो कभी डिस्क या डेटाबेस में सहेजा नहीं जाता। केवल संरचित विज़िट फ़ील्ड, सुधार इतिहास और रेफ़रल का संक्षिप्त अंश (अधिकतम 240 अक्षर) सहेजा जाता है।',
      },
      {
        heading: 'रो-लेवल सिक्योरिटी और ऑडिट लॉग',
        body: 'हर तालिका पर Supabase Postgres RLS लागू है। कार्यकर्ता केवल अपना डेटा देख सकते हैं। पर्यवेक्षक केवल कुल संख्या और रेफ़रल देखते हैं — कच्चा ट्रांसक्रिप्ट कभी नहीं।',
      },
      {
        heading: 'डेटा अवधि और तुरंत खाता हटाना',
        body: 'अनाम डेमो खाते 7 दिनों में हट जाते हैं। साइन-इन कार्यकर्ता सेटिंग्स → खाता हटाएँ से कभी भी अपना पूरा डेटा स्थायी रूप से हटा सकते हैं।',
      },
    ],
  },
  mr: {
    backHome: 'ASHA SAKHI वर परत जा',
    title: 'गोपनीयता आणि डेटा हाताळणी',
    intro: 'ASHA SAKHI हा फक्त नमुना (सिंथेटिक) डेमो डेटासाठी तयार केलेला प्रोटोटाइप आहे. कृपया खऱ्या रुग्णांची नावे किंवा वैद्यकीय माहिती भरू नका.',
    cards: [
      {
        heading: 'कार्यकर्ता खात्याबद्दल काय साठवले जाते',
        body: 'साइन-अप करताना तुमचा ईमेल (Supabase Auth), नाव, निवडलेला नमुना परिसर, भाषा आणि संमती वेळ जतन केली जाते. निनावी डेमो सत्रे ७ दिवसांनंतर आपोआप हटवली जातात.',
      },
      {
        heading: 'फक्त नमुना डेटा — कोणताही ऑडिओ साठवला जात नाही',
        body: 'सर्व लाभार्थी आणि आरोग्य केंद्रे नमुना नोंदी आहेत. ऑडिओ कधीही साठवला जात नाही. केवळ संरचित भेट रकाने, दुरुस्ती इतिहास आणि रेफरलचा छोटा उतारा (कमाल २४० अक्षरे) जतन केला जातो.',
      },
      {
        heading: 'रो-लेव्हल सिक्युरिटी आणि ऑडिट लॉग',
        body: 'प्रत्येक टेबलवर Supabase Postgres RLS लागू आहे. कार्यकर्त्या फक्त स्वतःचा डेटा पाहू शकतात. पर्यवेक्षक केवळ एकत्रित संख्या व रेफरल पाहतात.',
      },
      {
        heading: 'डेटा कालावधी आणि त्वरित खाते हटवणे',
        body: 'निनावी डेमो खाती ७ दिवसांत हटवली जातात. लॉग-इन कार्यकर्ते सेटिंग्ज → खाते हटवा मधून कधीही स्वतःचा सर्व डेटा कायमस्वरूपी हटवू शकतात.',
      },
    ],
  },
};

export default function PrivacyPage() {
  const { language, setLanguage, dark } = useAppStore();
  const c = privacyCopy[language];
  const icons = [Lock, Database, ShieldCheck, Trash2];

  return (
    <div className={dark ? 'auth-shell dark' : 'auth-shell'}>
      <header className="privacy-header">
        <RouterLink to="/" className="auth-back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{c.backHome}</span>
        </RouterLink>
        <select
          aria-label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          <option value="en">EN</option>
          <option value="hi">हिं</option>
          <option value="mr">मरा</option>
        </select>
      </header>
      <main id="main-content" className="privacy-main">
        <span className="landing-pill">Prototype · Synthetic demo data</span>
        <h1>{c.title}</h1>
        <p className="privacy-intro">{c.intro}</p>
        <div className="privacy-grid">
          {c.cards.map((card, idx) => {
            const Icon = icons[idx] ?? ShieldCheck;
            return (
              <article key={card.heading} className="privacy-card">
                <h2>
                  <Icon size={18} aria-hidden="true" />
                  <span>{card.heading}</span>
                </h2>
                <p>{card.body}</p>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
