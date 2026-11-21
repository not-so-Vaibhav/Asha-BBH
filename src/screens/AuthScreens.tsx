import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Heart,
  Mail,
  Mic,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { Language } from '../domain/types';
import { TURNSTILE_SITE_KEY } from '../lib/supabase';
import { RouterLink, getNextParam, navigate, useRouterLocation } from '../router';
import { useAppStore } from '../store/useAppStore';

export type AuthScreenMode = 'login' | 'signup' | 'forgot' | 'reset' | 'onboarding';

function passwordStrength(pw: string): { score: number; label: string; rules: Array<{ ok: boolean; text: string }> } {
  const rules = [
    { ok: pw.length >= 8, text: 'At least 8 characters' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), text: 'Upper and lowercase letters' },
    { ok: /\d/.test(pw), text: 'At least one number' },
  ];
  const score = rules.filter((r) => r.ok).length;
  const label = score === 0 ? 'Too short' : score === 1 ? 'Weak' : score === 2 ? 'Fair' : 'Strong';
  return { score, label, rules };
}

function TurnstileBox({ onToken }: { onToken: (token: string | undefined) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;
    const scriptId = 'cf-turnstile-script';
    const renderWidget = () => {
      const turnstile = (window as Window & { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void } }).turnstile;
      if (turnstile && containerRef.current && containerRef.current.childElementCount === 0) {
        turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (tok: string) => onToken(tok),
          'expired-callback': () => onToken(undefined),
        });
      }
    };
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = renderWidget;
      document.head.appendChild(s);
    } else {
      renderWidget();
    }
  }, [onToken]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="auth-captcha" aria-label="Verification check" />;
}

export default function AuthScreens({ mode }: { mode: AuthScreenMode }) {
  const { search } = useRouterLocation();
  const nextPath = useMemo(() => getNextParam(search, '/app'), [search]);
  const { language, setLanguage, dark } = useAppStore();
  const {
    signIn,
    signUp,
    signInDemo,
    requestPasswordReset,
    updatePassword,
    completeOnboarding,
    areas,
    user,
    worker,
    supabaseMode,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState(
    () => (user?.user_metadata?.display_name as string | undefined) || worker?.displayName || '',
  );
  const [areaId, setAreaId] = useState(() => areas[0]?.id || 'AREA-DEMO-A');
  const [preferredLang, setPreferredLang] = useState<Language>(language);
  const [consentChecked, setConsentChecked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkEmailSent, setCheckEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    if (areas.length > 0 && !areas.some((a) => a.id === areaId)) {
      setAreaId(areas[0].id);
    }
  }, [areas, areaId]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  const strength = passwordStrength(password);

  const handleDemoShortcut = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await signInDemo({ language, captchaToken });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      navigate('/app', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError('Please enter both your email and password.');
        return;
      }
      setBusy(true);
      try {
        const res = await signIn({ email, password });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        navigate(nextPath, { replace: true });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'signup') {
      if (!displayName.trim()) {
        setError('Please enter your display name.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      if (strength.score < 3) {
        setError('Password must be at least 8 characters with upper/lowercase letters and a number.');
        return;
      }
      if (!consentChecked) {
        setError('Please confirm that you will only enter synthetic demo data.');
        return;
      }
      setBusy(true);
      try {
        const res = await signUp({ email, password, displayName, language, captchaToken });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.needsEmailConfirmation) {
          setCheckEmailSent(true);
          setResendCooldown(60);
        } else {
          navigate('/onboarding', { replace: true });
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'forgot') {
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter the email address for your account.');
        return;
      }
      setBusy(true);
      try {
        const res = await requestPasswordReset(email);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setCheckEmailSent(true);
        setResendCooldown(60);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (strength.score < 3) {
        setError('New password must be at least 8 characters with upper/lowercase letters and a number.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setBusy(true);
      try {
        const res = await updatePassword(password);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfoMessage('Password updated. Redirecting to your workspace…');
        setTimeout(() => navigate('/app', { replace: true }), 900);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'onboarding') {
      if (!displayName.trim()) {
        setError('Please enter your display name.');
        return;
      }
      setBusy(true);
      try {
        const res = await completeOnboarding({ displayName, areaId, language: preferredLang });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        navigate('/app', { replace: true });
      } finally {
        setBusy(false);
      }
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email.trim()) return;
    setError('');
    setBusy(true);
    try {
      const res = await requestPasswordReset(email);
      if (!res.ok) setError(res.error);
      else {
        setInfoMessage('If an account exists for this email, a fresh link has been sent.');
        setResendCooldown(60);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={dark ? 'auth-shell dark' : 'auth-shell'}>
      <div className="auth-split">
        {/* Desktop Brand Panel */}
        <aside className="auth-brand-panel" aria-label="ASHA SAKHI overview">
          <RouterLink to="/" className="auth-brand-logo">
            <span className="auth-brand-mark" aria-hidden="true">
              <Heart size={18} />
            </span>
            <span>
              ASHA <strong>SAKHI</strong>
            </span>
          </RouterLink>

          <div className="auth-brand-copy">
            <span className="auth-badge">Prototype · Synthetic demo data</span>
            <h2>Speak the visit. We write the record.</h2>
            <p>Your Voice. Your Community. Better Healthcare.</p>
          </div>

          <div className="auth-preview-card" aria-hidden="true">
            <div className="auth-preview-top">
              <Mic size={16} />
              <span>Simulated preview · Gnani Prisma v3.0</span>
            </div>
            <p>“Sunita ANC follow-up, weight 55 kg, next visit 20 November.”</p>
            <div className="auth-preview-row">
              <span>Weight: 55 kg</span>
              <span>Next visit: 20 Nov</span>
            </div>
            <div className="auth-preview-foot">
              <ShieldCheck size={15} />
              <span>RLS-protected per-worker workspace</span>
            </div>
          </div>
        </aside>

        {/* Form Panel */}
        <main id="main-content" className="auth-form-panel">
          <div className="auth-topbar">
            <RouterLink to="/" className="auth-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Back to landing</span>
            </RouterLink>
            <select
              aria-label="Language"
              className="auth-lang-select"
              value={language}
              onChange={(e) => {
                const next = e.target.value as Language;
                setLanguage(next);
                setPreferredLang(next);
              }}
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="mr">मराठी</option>
            </select>
          </div>

          <div className="auth-card">
            {checkEmailSent ? (
              <div className="auth-check-email" role="status" aria-live="polite">
                <Mail size={36} aria-hidden="true" className="auth-mail-icon" />
                <h1>Check your email</h1>
                <p>
                  We sent a link to <strong>{email}</strong>. Open the link to continue.
                </p>
                {infoMessage && <p className="auth-success">{infoMessage}</p>}
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary"
                  disabled={busy || resendCooldown > 0}
                  onClick={handleResend}
                >
                  {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend email'}
                </button>
                <RouterLink to="/login" className="auth-link-center">
                  Back to log in
                </RouterLink>
              </div>
            ) : (
              <>
                <div className="auth-heading">
                  <h1>
                    {mode === 'login' && 'Log in to ASHA SAKHI'}
                    {mode === 'signup' && 'Create worker account'}
                    {mode === 'forgot' && 'Reset your password'}
                    {mode === 'reset' && 'Choose a new password'}
                    {mode === 'onboarding' && 'Set up your worker profile'}
                  </h1>
                  <p>
                    {mode === 'login' && 'Sign in with your worker account or start an instant anonymous demo.'}
                    {mode === 'signup' && 'Accounts are created with worker access on synthetic demo data.'}
                    {mode === 'forgot' && 'Enter your email and we will send you a password reset link.'}
                    {mode === 'reset' && 'Enter a strong new password for your ASHA SAKHI account.'}
                    {mode === 'onboarding' && 'Choose your sample area and preferred language to prepare your workspace.'}
                  </p>
                </div>

                {supabaseMode === 'local-preview' && (
                  <p className="auth-mode-note">
                    Local preview auth mode (set <code>VITE_SUPABASE_URL</code> &amp; <code>VITE_SUPABASE_ANON_KEY</code> to connect live Supabase Auth).
                  </p>
                )}

                <form onSubmit={handleSubmit} className="auth-form" noValidate>
                  {(mode === 'signup' || mode === 'onboarding') && (
                    <div className="auth-field">
                      <label htmlFor="auth-display-name">Display name</label>
                      <input
                        id="auth-display-name"
                        type="text"
                        autoComplete="name"
                        required
                        placeholder="e.g. Sunita Deshmukh"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                      />
                    </div>
                  )}

                  {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
                    <div className="auth-field">
                      <label htmlFor="auth-email">Email address</label>
                      <input
                        id="auth-email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="worker@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
                    <div className="auth-field">
                      <div className="auth-label-row">
                        <label htmlFor="auth-password">{mode === 'reset' ? 'New password' : 'Password'}</label>
                        {mode === 'login' && (
                          <RouterLink to="/forgot" className="auth-inline-link">
                            Forgot password?
                          </RouterLink>
                        )}
                      </div>
                      <div className="auth-password-wrap">
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="auth-eye-btn"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                        </button>
                      </div>

                      {(mode === 'signup' || mode === 'reset') && (
                        <div className="auth-strength" aria-live="polite">
                          <div className="auth-strength-bar">
                            {[1, 2, 3].map((n) => (
                              <span key={n} className={strength.score >= n ? `bar active s-${strength.score}` : 'bar'} />
                            ))}
                          </div>
                          <small>Strength: {strength.label}</small>
                          <ul className="auth-pw-rules">
                            {strength.rules.map((r) => (
                              <li key={r.text} className={r.ok ? 'ok' : ''}>
                                <CheckCircle2 size={13} aria-hidden="true" />
                                <span>{r.text}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {mode === 'reset' && (
                    <div className="auth-field">
                      <label htmlFor="auth-confirm-password">Confirm new password</label>
                      <input
                        id="auth-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  )}

                  {mode === 'onboarding' && (
                    <>
                      <div className="auth-field">
                        <label htmlFor="auth-area">Assigned sample area</label>
                        <select id="auth-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                          {areas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.district})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="auth-field">
                        <label htmlFor="auth-pref-lang">Preferred language</label>
                        <select
                          id="auth-pref-lang"
                          value={preferredLang}
                          onChange={(e) => setPreferredLang(e.target.value as Language)}
                        >
                          <option value="en">English</option>
                          <option value="hi">हिंदी (Hindi)</option>
                          <option value="mr">मराठी (Marathi)</option>
                        </select>
                      </div>
                    </>
                  )}

                  {mode === 'signup' && (
                    <label className="auth-consent">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                      />
                      <span>
                        I understand this is a prototype with synthetic data and I will not enter real patient information.{' '}
                        <RouterLink to="/privacy" className="auth-inline-link">
                          Privacy policy
                        </RouterLink>
                      </span>
                    </label>
                  )}

                  {(mode === 'signup' || mode === 'login') && <TurnstileBox onToken={setCaptchaToken} />}

                  {error && (
                    <p className="auth-error" role="alert">
                      {error}
                    </p>
                  )}
                  {infoMessage && (
                    <p className="auth-success" role="status">
                      {infoMessage}
                    </p>
                  )}

                  <button type="submit" className="auth-btn auth-btn-primary" disabled={busy}>
                    {busy
                      ? 'Please wait…'
                      : mode === 'login'
                        ? 'Log in'
                        : mode === 'signup'
                          ? 'Create worker account'
                          : mode === 'forgot'
                            ? 'Send reset link'
                            : mode === 'reset'
                              ? 'Save new password'
                              : 'Save profile & enter workspace'}
                  </button>
                </form>

                {mode !== 'onboarding' && mode !== 'reset' && (
                  <>
                    <div className="auth-divider">
                      <span>or</span>
                    </div>
                    <button
                      type="button"
                      className="auth-btn auth-btn-secondary"
                      disabled={busy}
                      onClick={handleDemoShortcut}
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      <span>Try the demo (no sign-up)</span>
                    </button>
                  </>
                )}

                <div className="auth-switch-row">
                  {mode === 'login' && (
                    <span>
                      New to ASHA SAKHI?{' '}
                      <RouterLink to="/signup" className="auth-inline-link">
                        Create worker account
                      </RouterLink>
                    </span>
                  )}
                  {mode === 'signup' && (
                    <span>
                      Already have an account?{' '}
                      <RouterLink to="/login" className="auth-inline-link">
                        Log in
                      </RouterLink>
                    </span>
                  )}
                  {mode === 'forgot' && (
                    <RouterLink to="/login" className="auth-inline-link">
                      Back to log in
                    </RouterLink>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
