import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Language } from '../domain/types';
import { isSupabaseConfigured, getSupabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

export type SampleArea = {
  id: string;
  code: string;
  name: string;
  district: string;
  block: string;
};

export const FALLBACK_SAMPLE_AREAS: SampleArea[] = [
  { id: 'AREA-DEMO-A', code: 'AREA-DEMO-A', name: 'Demo Block A · Pipalwadi', district: 'Sample District A', block: 'Demo Block A' },
  { id: 'AREA-DEMO-B', code: 'AREA-DEMO-B', name: 'Demo Block A · Lotuswadi', district: 'Sample District B', block: 'Demo Block A' },
  { id: 'AREA-DEMO-C', code: 'AREA-DEMO-C', name: 'Demo Block B · Riverbend', district: 'Sample District C', block: 'Demo Block B' },
];

export type WorkerProfile = {
  id: string;
  displayName: string;
  ashaIdDemo: string;
  areaId: string;
  areaName: string;
  language: Language;
  role: 'worker' | 'supervisor';
  isDemo: boolean;
  email: string | null;
};

type LocalAccountRecord = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  areaId?: string;
  language: Language;
  onboarded: boolean;
};

type LocalSessionState = {
  id: string;
  email: string | null;
  isDemo: boolean;
  displayName: string;
  areaId: string | null;
  language: Language;
  onboarded: boolean;
};

const LOCAL_ACCOUNTS_KEY = 'asha-sakhi-local-accounts-v1';
const LOCAL_SESSION_KEY = 'asha-sakhi-local-session-v1';

function readLocalAccounts(): LocalAccountRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || '[]') as LocalAccountRecord[];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalAccountRecord[]) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {}
}

function readLocalSession(): LocalSessionState | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalSessionState) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(session: LocalSessionState | null) {
  try {
    if (!session) localStorage.removeItem(LOCAL_SESSION_KEY);
    else localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export type AuthActionResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; error: string; code?: string };

type AuthContextValue = {
  loading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  isDemoSession: boolean;
  supabaseMode: 'supabase' | 'local-preview';
  user: User | null;
  session: Session | null;
  worker: WorkerProfile | null;
  areas: SampleArea[];
  sessionExpiredNotice: boolean;
  clearSessionExpiredNotice: () => void;
  signUp: (input: { email: string; password: string; displayName: string; language: Language; captchaToken?: string }) => Promise<AuthActionResult>;
  signIn: (input: { email: string; password: string }) => Promise<AuthActionResult>;
  signInDemo: (input?: { language?: Language; captchaToken?: string }) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
  completeOnboarding: (input: { displayName: string; areaId: string; language: Language }) => Promise<AuthActionResult>;
  deleteAccount: () => Promise<AuthActionResult>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid password')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('email in use')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (lower.includes('expired') || lower.includes('invalid token') || lower.includes('otp')) {
    return 'This reset or confirmation link has expired. Please request a new one.';
  }
  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('429')) {
    return 'Too many requests right now. Please wait a minute and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Unable to reach the authentication service. Check your connection and try again.';
  }
  if (lower.includes('captcha')) {
    return 'Please complete the verification check and try again.';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [localSession, setLocalSession] = useState<LocalSessionState | null>(() => (isSupabaseConfigured ? null : readLocalSession()));
  const [areas, setAreas] = useState<SampleArea[]>(FALLBACK_SAMPLE_AREAS);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  const loadAreas = useCallback(async () => {
    const sb = await getSupabase();
    if (!sb) {
      setAreas(FALLBACK_SAMPLE_AREAS);
      return FALLBACK_SAMPLE_AREAS;
    }
    const { data } = await sb.from('areas').select('id, code, name, district, block').order('code', { ascending: true });
    if (data && data.length > 0) {
      setAreas(data);
      return data;
    }
    return FALLBACK_SAMPLE_AREAS;
  }, []);

  const loadWorkerProfile = useCallback(
    async (authUser: User | null, loadedAreas?: SampleArea[]) => {
      const sb = await getSupabase();
      if (!sb || !authUser) {
        setWorker(null);
        return;
      }
      const areaList = loadedAreas ?? areas;
      const { data } = await sb.from('workers').select('*').eq('id', authUser.id).maybeSingle();
      if (!data) {
        setWorker(null);
        return;
      }
      const matchedArea = areaList.find((a) => a.id === data.area_id);
      const profile: WorkerProfile = {
        id: data.id,
        displayName: data.display_name,
        ashaIdDemo: data.asha_id_demo,
        areaId: data.area_id,
        areaName: matchedArea?.name ?? 'Demo Block A',
        language: data.language,
        role: data.role,
        isDemo: data.is_demo || Boolean(authUser.is_anonymous),
        email: authUser.email ?? null,
      };
      setWorker(profile);
      useAppStore.getState().setLanguage(profile.language);
    },
    [areas],
  );

  // Sync local-preview session into WorkerProfile when Supabase env vars are not configured
  useEffect(() => {
    if (isSupabaseConfigured) return;
    if (!localSession) {
      setWorker(null);
      setLoading(false);
      return;
    }
    if (!localSession.onboarded || !localSession.areaId) {
      setWorker(null);
      setLoading(false);
      return;
    }
    const matchedArea = FALLBACK_SAMPLE_AREAS.find((a) => a.id === localSession.areaId || a.code === localSession.areaId);
    setWorker({
      id: localSession.id,
      displayName: localSession.displayName,
      ashaIdDemo: localSession.isDemo ? 'ASHA-DEMO' : `ASHA-${localSession.id.slice(-4).toUpperCase()}`,
      areaId: matchedArea?.id ?? FALLBACK_SAMPLE_AREAS[0].id,
      areaName: matchedArea?.name ?? FALLBACK_SAMPLE_AREAS[0].name,
      language: localSession.language,
      role: 'worker',
      isDemo: localSession.isDemo,
      email: localSession.email,
    });
    setLoading(false);
  }, [localSession]);

  // Bootstrap real Supabase session & subscribe to auth state changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const sb = await getSupabase();
      if (!sb || !mounted) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const [{ data }, loadedAreas] = await Promise.all([sb.auth.getSession(), loadAreas()]);
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        await loadWorkerProfile(data.session?.user ?? null, loadedAreas);
      } finally {
        if (mounted) setLoading(false);
      }

      const { data: sub } = sb.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT' && session) {
          setSessionExpiredNotice(false);
        }
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        if (nextSession?.user) {
          void loadAreas().then((loadedAreas) => loadWorkerProfile(nextSession.user, loadedAreas));
        } else {
          setWorker(null);
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [loadAreas, loadWorkerProfile]);

  const signUp: AuthContextValue['signUp'] = useCallback(async ({ email, password, displayName, language, captchaToken }) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    const sb = await getSupabase();
    if (!sb) {
      const accounts = readLocalAccounts();
      if (accounts.some((a) => a.email === cleanEmail)) {
        return { ok: false, error: friendlyAuthError('email in use'), code: 'EMAIL_IN_USE' };
      }
      const created: LocalAccountRecord = {
        id: `local-${Date.now()}`,
        email: cleanEmail,
        password,
        displayName: cleanName,
        language,
        onboarded: false,
      };
      writeLocalAccounts([...accounts, created]);
      const next: LocalSessionState = {
        id: created.id,
        email: created.email,
        isDemo: false,
        displayName: created.displayName,
        areaId: null,
        language,
        onboarded: false,
      };
      writeLocalSession(next);
      setLocalSession(next);
      return { ok: true, needsEmailConfirmation: false };
    }

    const { data, error } = await sb.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
        captchaToken,
        data: {
          display_name: cleanName,
          preferred_language: language,
          synthetic_consent_accepted: true,
        },
      },
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message), code: error.code };
    const needsEmailConfirmation = Boolean(data.user && !data.session);
    return { ok: true, needsEmailConfirmation };
  }, []);

  const signIn: AuthContextValue['signIn'] = useCallback(async ({ email, password }) => {
    const cleanEmail = email.trim().toLowerCase();
    const sb = await getSupabase();
    if (!sb) {
      const accounts = readLocalAccounts();
      const match = accounts.find((a) => a.email === cleanEmail && a.password === password);
      if (!match) return { ok: false, error: friendlyAuthError('invalid login credentials'), code: 'INVALID_CREDENTIALS' };
      const next: LocalSessionState = {
        id: match.id,
        email: match.email,
        isDemo: false,
        displayName: match.displayName,
        areaId: match.areaId ?? null,
        language: match.language,
        onboarded: match.onboarded,
      };
      writeLocalSession(next);
      setLocalSession(next);
      return { ok: true };
    }

    const { data, error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) return { ok: false, error: friendlyAuthError(error.message), code: error.code };
    const loadedAreas = await loadAreas();
    await loadWorkerProfile(data.user, loadedAreas);
    return { ok: true };
  }, [loadAreas, loadWorkerProfile]);

  const signInDemo: AuthContextValue['signInDemo'] = useCallback(
    async ({ language = useAppStore.getState().language, captchaToken } = {}) => {
      const sb = await getSupabase();
      if (!sb) {
        const next: LocalSessionState = {
          id: `demo-${Date.now()}`,
          email: null,
          isDemo: true,
          displayName: 'Demo ASHA Worker',
          areaId: FALLBACK_SAMPLE_AREAS[0].id,
          language,
          onboarded: true,
        };
        writeLocalSession(next);
        setLocalSession(next);
        return { ok: true };
      }

      const { data, error } = await sb.auth.signInAnonymously({
        options: {
          captchaToken,
          data: { display_name: 'Demo ASHA Worker', preferred_language: language, is_demo: true },
        },
      });
      if (error) return { ok: false, error: friendlyAuthError(error.message), code: error.code };
      if (!data.user) return { ok: false, error: 'Could not start demo session.' };

      const seedRes = await sb.rpc('seed_demo_workspace', {
        p_display_name: 'Demo ASHA Worker',
        p_language: language,
      });
      if (seedRes.error) return { ok: false, error: friendlyAuthError(seedRes.error.message) };
      const loadedAreas = await loadAreas();
      await loadWorkerProfile(data.user, loadedAreas);
      return { ok: true };
    },
    [loadAreas, loadWorkerProfile],
  );

  const signOut = useCallback(async () => {
    const sb = await getSupabase();
    if (!sb) {
      writeLocalSession(null);
      setLocalSession(null);
      setWorker(null);
      return;
    }
    await sb.auth.signOut();
    setSession(null);
    setUser(null);
    setWorker(null);
  }, []);

  const requestPasswordReset: AuthContextValue['requestPasswordReset'] = useCallback(async (email) => {
    const cleanEmail = email.trim().toLowerCase();
    const sb = await getSupabase();
    if (!sb) {
      return { ok: true };
    }
    const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message), code: error.code };
    return { ok: true };
  }, []);

  const updatePassword: AuthContextValue['updatePassword'] = useCallback(async (newPassword) => {
    const sb = await getSupabase();
    if (!sb) {
      if (localSession?.email) {
        const accounts = readLocalAccounts().map((a) => (a.email === localSession.email ? { ...a, password: newPassword } : a));
        writeLocalAccounts(accounts);
      }
      return { ok: true };
    }
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendlyAuthError(error.message), code: error.code };
    return { ok: true };
  }, [localSession]);

  const completeOnboarding: AuthContextValue['completeOnboarding'] = useCallback(
    async ({ displayName, areaId, language }) => {
      const cleanName = displayName.trim();
      if (!cleanName) return { ok: false, error: 'Please enter your display name.' };
      const sb = await getSupabase();
      if (!sb) {
        if (!localSession) return { ok: false, error: 'Please log in first.' };
        const updated: LocalSessionState = {
          ...localSession,
          displayName: cleanName,
          areaId,
          language,
          onboarded: true,
        };
        writeLocalSession(updated);
        setLocalSession(updated);
        const accounts = readLocalAccounts().map((a) =>
          a.id === localSession.id ? { ...a, displayName: cleanName, areaId, language, onboarded: true } : a,
        );
        writeLocalAccounts(accounts);
        useAppStore.getState().setLanguage(language);
        return { ok: true };
      }

      if (!user) return { ok: false, error: 'Please log in first.' };
      const { error } = await sb.rpc('seed_demo_workspace', {
        p_display_name: cleanName,
        p_language: language,
        p_area_id: areaId,
      });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      if (!user.is_anonymous) {
        await sb.from('workers').update({ display_name: cleanName, area_id: areaId, language, is_demo: false }).eq('id', user.id);
      }
      const loadedAreas = await loadAreas();
      await loadWorkerProfile(user, loadedAreas);
      return { ok: true };
    },
    [loadAreas, loadWorkerProfile, localSession, user],
  );

  const deleteAccount: AuthContextValue['deleteAccount'] = useCallback(async () => {
    const sb = await getSupabase();
    if (!sb) {
      if (localSession) {
        const remaining = readLocalAccounts().filter((a) => a.id !== localSession.id);
        writeLocalAccounts(remaining);
      }
      writeLocalSession(null);
      setLocalSession(null);
      setWorker(null);
      useAppStore.getState().resetDemo();
      return { ok: true };
    }
    const { error } = await sb.rpc('delete_my_account');
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    await sb.auth.signOut();
    setSession(null);
    setUser(null);
    setWorker(null);
    useAppStore.getState().resetDemo();
    return { ok: true };
  }, [localSession]);

  const refreshProfile = useCallback(async () => {
    const sb = await getSupabase();
    if (!sb || !user) return;
    const loadedAreas = await loadAreas();
    await loadWorkerProfile(user, loadedAreas);
  }, [loadAreas, loadWorkerProfile, user]);

  const isAuthenticated = isSupabaseConfigured ? Boolean(user) : Boolean(localSession);
  const needsOnboarding = isAuthenticated && !worker;
  const isDemoSession = Boolean(worker?.isDemo || user?.is_anonymous || localSession?.isDemo);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      isAuthenticated,
      needsOnboarding,
      isDemoSession,
      supabaseMode: isSupabaseConfigured ? 'supabase' : 'local-preview',
      user,
      session,
      worker,
      areas,
      sessionExpiredNotice,
      clearSessionExpiredNotice: () => setSessionExpiredNotice(false),
      signUp,
      signIn,
      signInDemo,
      signOut,
      requestPasswordReset,
      updatePassword,
      completeOnboarding,
      deleteAccount,
      refreshProfile,
    }),
    [
      areas,
      completeOnboarding,
      deleteAccount,
      isAuthenticated,
      isDemoSession,
      loading,
      needsOnboarding,
      refreshProfile,
      requestPasswordReset,
      session,
      sessionExpiredNotice,
      signIn,
      signInDemo,
      signOut,
      signUp,
      updatePassword,
      user,
      worker,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
