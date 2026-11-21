import { useEffect, useState } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Globe,
  Heart,
  MapPin,
  Mic,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Volume2,
  WifiOff,
} from 'lucide-react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-700.css';
import '../landing.css';
import { landingCopy } from '../data/landingI18n';
import type { Language } from '../domain/types';
import { RouterLink, navigate } from '../router';
import { useAuth } from '../auth/AuthContext';
import { useAppStore } from '../store/useAppStore';

const STEP_IMAGES = [
  { src: '/landing/step-1.webp', alt: 'Voice capture screen preview', width: 480, height: 300 },
  { src: '/landing/step-2.webp', alt: 'Structured fields and audio read-back preview', width: 480, height: 300 },
  { src: '/landing/step-3.webp', alt: 'Single-field voice correction with history preview', width: 480, height: 300 },
  { src: '/landing/step-4.webp', alt: 'Confirmed visit and follow-up schedule preview', width: 480, height: 300 },
];

export default function LandingPage() {
  const { language, setLanguage, dark, toggleDark } = useAppStore();
  const { signInDemo, isAuthenticated, needsOnboarding } = useAuth();
  const reduceMotion = useReducedMotion();
  const c = landingCopy[language];

  const [demoPhase, setDemoPhase] = useState<0 | 1 | 2 | 3>(0);
  const [selectedLangChip, setSelectedLangChip] = useState<Language>(language);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');

  useEffect(() => {
    document.documentElement.lang = language;
    setSelectedLangChip(language);
  }, [language]);

  // Looping scripted simulated preview inside hero phone mockup
  useEffect(() => {
    if (reduceMotion) {
      setDemoPhase(3);
      return;
    }
    const timer = window.setInterval(() => {
      setDemoPhase((prev) => (((prev + 1) % 4) as 0 | 1 | 2 | 3));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const handleTryDemo = async () => {
    setDemoError('');
    setDemoLoading(true);
    try {
      const res = await signInDemo({ language });
      if (!res.ok) {
        setDemoError(res.error);
        return;
      }
      navigate('/app');
    } finally {
      setDemoLoading(false);
    }
  };

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.4, ease: 'easeOut' as const },
      };

  const transcriptWords = c.mockupTranscriptText.split(' ');
  const visibleTranscript =
    demoPhase === 0
      ? transcriptWords.slice(0, Math.max(3, Math.ceil(transcriptWords.length * 0.45))).join(' ') + '…'
      : c.mockupTranscriptText;

  return (
    <LazyMotion features={domAnimation}>
      <div className={dark ? 'lp-root dark' : 'lp-root'}>
        <a href="#main-content" className="lp-skip-link">
          Skip to main content
        </a>

        {/* 1. Sticky Header */}
        <header className="lp-header">
          <div className="lp-container lp-header-inner">
            <RouterLink to="/" className="lp-brand" aria-label="ASHA SAKHI home">
              <span className="lp-brand-mark" aria-hidden="true">
                <Heart size={18} />
              </span>
              <span className="lp-brand-text">
                ASHA <strong>SAKHI</strong>
              </span>
            </RouterLink>

            <nav className="lp-nav" aria-label="Landing navigation">
              <a href="#how-it-works">{c.navHowItWorks}</a>
              <a href="#safety">{c.navSafety}</a>
              <a href="#faq">{c.navFaq}</a>
            </nav>

            <div className="lp-header-actions">
              <label className="lp-sr-only" htmlFor="lp-lang-select">
                Language
              </label>
              <select
                id="lp-lang-select"
                aria-label="Language"
                className="lp-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="en">EN</option>
                <option value="hi">हिं</option>
                <option value="mr">मरा</option>
              </select>

              <button
                type="button"
                className="lp-icon-btn"
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleDark}
              >
                {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              </button>

              {isAuthenticated ? (
                <RouterLink to={needsOnboarding ? '/onboarding' : '/app'} className="lp-btn lp-btn-primary">
                  Open app
                </RouterLink>
              ) : (
                <>
                  <RouterLink to="/login" className="lp-btn lp-btn-ghost">
                    {c.navLogin}
                  </RouterLink>
                  <RouterLink to="/signup" className="lp-btn lp-btn-primary">
                    {c.navGetStarted}
                  </RouterLink>
                </>
              )}
            </div>
          </div>
        </header>

        <main id="main-content">
          {/* 2. Hero */}
          <section className="lp-hero">
            <div className="lp-container lp-hero-grid">
              <div className="lp-hero-copy">
                <span className="lp-pill">{c.heroBadge}</span>
                <h1>{c.heroTitle}</h1>
                <p className="lp-hero-sub">{c.heroSubhead}</p>
                <p className="lp-tagline">{c.heroTagline}</p>

                <div className="lp-hero-ctas">
                  <button
                    type="button"
                    className="lp-btn lp-btn-primary lp-btn-lg"
                    onClick={handleTryDemo}
                    disabled={demoLoading}
                  >
                    <Sparkles size={18} aria-hidden="true" />
                    <span>{demoLoading ? 'Starting demo…' : c.heroPrimaryCta}</span>
                  </button>
                  <RouterLink to="/signup" className="lp-btn lp-btn-secondary lp-btn-lg">
                    {c.heroSecondaryCta}
                  </RouterLink>
                </div>

                {demoError && (
                  <p className="lp-inline-error" role="alert">
                    {demoError}
                  </p>
                )}
              </div>

              {/* Right-side Phone Mockup: Looping Scripted Simulated Preview */}
              <div className="lp-hero-visual" aria-label={c.mockupLabel}>
                <div className="lp-phone-frame">
                  <div className="lp-phone-top">
                    <span className="lp-phone-pill">{c.mockupLabel}</span>
                    <span className="lp-phone-status">
                      <Mic size={13} aria-hidden="true" />
                      {c.mockupTranscriptTitle}
                    </span>
                  </div>

                  <div className="lp-phone-transcript">
                    <small>Sunita Patil · BEN-1001</small>
                    <p>{visibleTranscript}</p>
                  </div>

                  <div className="lp-phone-fields">
                    <div className={demoPhase >= 1 ? 'lp-field-chip filled' : 'lp-field-chip'}>
                      <span>Visit type</span>
                      <strong>{demoPhase >= 1 ? 'ANC' : '—'}</strong>
                    </div>
                    <div className={demoPhase >= 1 ? 'lp-field-chip filled' : 'lp-field-chip'}>
                      <span>Weight</span>
                      <strong>{demoPhase >= 1 ? '55 kg' : '—'}</strong>
                    </div>
                    <div className={demoPhase >= 2 ? 'lp-field-chip filled' : 'lp-field-chip'}>
                      <span>Vaccinations</span>
                      <strong>{demoPhase >= 2 ? 'None reported' : '—'}</strong>
                    </div>
                    <div className={demoPhase >= 2 ? 'lp-field-chip filled' : 'lp-field-chip'}>
                      <span>Next visit</span>
                      <strong>{demoPhase >= 2 ? '20 Nov 2026' : '—'}</strong>
                    </div>
                  </div>

                  <div className={demoPhase >= 3 ? 'lp-phone-confirm active' : 'lp-phone-confirm'}>
                    <Check size={16} aria-hidden="true" />
                    <span>{c.mockupSavedChip}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Trust Strip */}
          <section className="lp-trust-strip" aria-label="Prototype disclosures">
            <div className="lp-container">
              <p>{c.trustStrip}</p>
            </div>
          </section>

          {/* 4. The Problem */}
          <m.section className="lp-section" {...reveal}>
            <div className="lp-container">
              <span className="lp-eyebrow">{c.problemEyebrow}</span>
              <h2>{c.problemTitle}</h2>
              <div className="lp-grid-3">
                {c.problemCards.map((card) => (
                  <article key={card.title} className="lp-card">
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </m.section>

          {/* 5. How It Works */}
          <m.section id="how-it-works" className="lp-section lp-section-alt" {...reveal}>
            <div className="lp-container">
              <span className="lp-eyebrow">{c.howEyebrow}</span>
              <h2>{c.howTitle}</h2>
              <div className="lp-grid-4">
                {c.howSteps.map((step, idx) => {
                  const img = STEP_IMAGES[idx];
                  return (
                    <article key={step.step} className="lp-step-card">
                      <div className="lp-step-media">
                        <img
                          src={img.src}
                          alt={img.alt}
                          width={img.width}
                          height={img.height}
                          loading="lazy"
                          decoding="async"
                        />
                        <span className="lp-step-num">{step.step}</span>
                      </div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                      <small>{step.caption}</small>
                    </article>
                  );
                })}
              </div>
            </div>
          </m.section>

          {/* 6. Safety By Design */}
          <m.section id="safety" className="lp-section" {...reveal}>
            <div className="lp-container lp-safety-grid">
              <div>
                <span className="lp-eyebrow lp-eyebrow-danger">{c.safetyEyebrow}</span>
                <h2>{c.safetyTitle}</h2>
                <p className="lp-lead">{c.safetyBody}</p>
                <ul className="lp-safety-list">
                  {c.safetyPoints.map((pt) => (
                    <li key={pt}>
                      <ShieldCheck size={18} aria-hidden="true" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lp-safety-visual">
                <div className="lp-phone-frame lp-phone-danger">
                  <div className="lp-danger-header">
                    <AlertTriangle size={20} aria-hidden="true" />
                    <span>{c.safetyMockBadge}</span>
                  </div>
                  <h3>{c.safetyMockRule}</h3>
                  <p>{c.safetyMockMessage}</p>
                  <div className="lp-danger-meta">
                    <span>Pending review</span>
                    <span>MoHFW guideline</span>
                  </div>
                  <div className="lp-danger-cta">
                    <MapPin size={16} aria-hidden="true" />
                    <span>{c.safetyMockAction}</span>
                  </div>
                </div>
              </div>
            </div>
          </m.section>

          {/* 7. Your Language */}
          <m.section className="lp-section lp-section-alt" {...reveal}>
            <div className="lp-container">
              <span className="lp-eyebrow">{c.langEyebrow}</span>
              <h2>{c.langTitle}</h2>
              <p className="lp-lead">{c.langSubtitle}</p>

              <div className="lp-lang-chips" role="group" aria-label="Sample languages">
                {(['en', 'hi', 'mr'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={selectedLangChip === code ? 'lp-chip active' : 'lp-chip'}
                    aria-pressed={selectedLangChip === code}
                    onClick={() => setSelectedLangChip(code)}
                  >
                    <Globe size={16} aria-hidden="true" />
                    <span>{c.langSamples[code].label}</span>
                  </button>
                ))}
              </div>

              <div className="lp-lang-sample-card">
                <p className="lp-sample-quote">{c.langSamples[selectedLangChip].sample}</p>
                <small>{c.langSamples[selectedLangChip].note}</small>
              </div>
            </div>
          </m.section>

          {/* 8. Built for the Field */}
          <m.section className="lp-section" {...reveal}>
            <div className="lp-container">
              <span className="lp-eyebrow">{c.fieldEyebrow}</span>
              <h2>{c.fieldTitle}</h2>
              <div className="lp-grid-2">
                {c.fieldCards.map((card, i) => {
                  const icons = [Volume2, Mic, WifiOff, MapPin];
                  const Icon = icons[i] ?? ShieldCheck;
                  return (
                    <article key={card.title} className="lp-card lp-field-card">
                      <span className="lp-card-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <div>
                        <h3>{card.title}</h3>
                        <p>{card.body}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </m.section>

          {/* 9. FAQ Accordion */}
          <m.section id="faq" className="lp-section lp-section-alt" {...reveal}>
            <div className="lp-container lp-faq-wrap">
              <span className="lp-eyebrow">{c.faqEyebrow}</span>
              <h2>{c.faqTitle}</h2>
              <div className="lp-faq-list">
                {c.faqs.map((item, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={item.q} className="lp-faq-item">
                      <h3>
                        <button
                          type="button"
                          className="lp-faq-trigger"
                          aria-expanded={isOpen}
                          onClick={() => setOpenFaq(isOpen ? null : idx)}
                        >
                          <span>{item.q}</span>
                          <ChevronDown
                            size={18}
                            aria-hidden="true"
                            className={isOpen ? 'lp-chevron open' : 'lp-chevron'}
                          />
                        </button>
                      </h3>
                      {isOpen && <p className="lp-faq-answer">{item.a}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </m.section>

          {/* 10. Final CTA */}
          <m.section className="lp-final-cta" {...reveal}>
            <div className="lp-container lp-final-cta-card">
              <h2>{c.ctaTitle}</h2>
              <p>{c.ctaSubtitle}</p>
              <div className="lp-hero-ctas lp-cta-center">
                <button
                  type="button"
                  className="lp-btn lp-btn-saffron lp-btn-lg"
                  onClick={handleTryDemo}
                  disabled={demoLoading}
                >
                  {demoLoading ? 'Starting demo…' : c.ctaPrimary}
                </button>
                <RouterLink to="/signup" className="lp-btn lp-btn-outline-light lp-btn-lg">
                  {c.ctaSecondary}
                </RouterLink>
              </div>
            </div>
          </m.section>
        </main>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-container lp-footer-inner">
            <div className="lp-footer-brand">
              <strong>ASHA SAKHI</strong>
              <p>{c.footerSyntheticNote}</p>
              {c.nativeReviewNote && <small>{c.nativeReviewNote}</small>}
            </div>
            <div className="lp-footer-links">
              <RouterLink to="/privacy">{c.footerPrivacy}</RouterLink>
              <a href="#safety">{c.footerLimitations}</a>
              <a href="https://github.com/not-so-Vaibhav/Asha-BBH" target="_blank" rel="noreferrer">
                {c.footerGithub}
              </a>
              <a href="mailto:hello@asha-sakhi.example">{c.footerContact}</a>
            </div>
          </div>
        </footer>
      </div>
    </LazyMotion>
  );
}
