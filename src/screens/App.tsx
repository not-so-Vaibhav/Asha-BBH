import '../style.css';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronRight, ClipboardList, Download, Heart,
  Home, MapPin, Mic, Phone, RefreshCw, Search, Settings, Sun, Users, Volume2, WifiOff, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { beneficiaries as seedBeneficiaries } from '../data/seed';
import {
  createReferralRemote,
  createSupabaseSyncTransport,
  fetchWorkspaceFromSupabase,
  markFollowUpDoneRemote,
} from '../data/supabaseRepo';
import { RouterLink, navigate } from '../router';
import { copy, extraCopy, localizeAge, localizeDue } from '../data/i18n';
import { demoDistricts, facility, villages } from '../data/geo';
import { correctField } from '../domain/correction';
import { followupsToCsv, referralsToCsv, triggerCsvDownload, visitsToCsv } from '../domain/csvExport';
import { findSameDayDuplicateVisit } from '../domain/duplicateCheck';
import { extractDetailed, type VisitTypeSource } from '../domain/extraction';
import type { Beneficiary, DangerSource, FollowUp, Language, Referral, Rule, VisitFields, VisitRecord, VisitType } from '../domain/types';
import { localizedRuleCategory, rules, scanDangerSigns, type DangerMatch } from '../domain/rules';
import { defaultDraftQueue, defaultSyncTransport, makeVisitIdempotencyKey, type OfflineDraft } from '../offline/draftQueue';
import { DEMO_TODAY, useAppStore } from '../store/useAppStore';
import { SimulatedProvider } from '../voice/simulated';
import { BrowserSpeechProvider } from '../voice/browserSpeech';
import { GnaniCaptureError, GnaniProvider } from '../voice/gnani';
import type { SpeechProvider } from '../voice/SpeechProvider';
import { speakAlert, speakText, stopSpeaking, warmAlertAudioCache, type SpeakResult } from '../voice/tts';
import { displayValue, formattedDate, localizeVisitType, recordText } from '../voice/readback';
import { buildTomorrowReminderText, getTomorrowsFollowUps } from '../voice/reminders';
import { triggerAlertVibration, type VibrationResult } from '../voice/alertFeedback';
import { getVoiceTelemetry, subscribeVoiceTelemetry, updateVoiceTelemetry, type SttConnectionState } from '../voice/telemetry';

const MapScreen = lazy(() => import('./MapScreen'));
const SettingsScreen = lazy(() => import('./SettingsScreen'));
const AboutScreen = lazy(() => import('./AboutScreen'));

type Screen = 'Home' | 'People' | 'Follow-ups' | 'Referrals' | 'Settings' | 'About' | 'Visit' | 'History' | 'Map';
type ProviderTag = 'gnani' | 'simulated' | 'browser' | 'fallback-typed' | 'fallback-browser';

const today = DEMO_TODAY;
const visitTypes: VisitType[] = ['ANC', 'PNC', 'HBNC', 'HBYC', 'Immunisation', 'General'];

const emptyFields = (beneficiaryId: string): VisitFields => ({
  beneficiaryId,
  visitType: 'General',
  weight: 'Not captured',
  vaccinationsDue: 'None reported',
  nextVisitDate: 'Not set',
});

const isoToday = () => new Date().toISOString().slice(0, 10);

const localizeFieldName = (field: keyof VisitFields, language: Language) => {
  const t = copy[language];
  const map: Record<keyof VisitFields, string> = {
    beneficiaryId: t.beneficiaryId,
    visitType: t.visitType,
    weight: t.weight,
    vaccinationsDue: t.vaccinations,
    nextVisitDate: t.nextVisit,
  };
  return map[field];
};

const localizeProviderTag = (tag: ProviderTag, language: Language) => {
  const x = extraCopy[language];
  switch (tag) {
    case 'gnani': return x.gnaniLabel;
    case 'simulated': return x.simulatedLabel;
    case 'browser': return x.browserSpeechLabel;
    case 'fallback-typed': return x.fallbackTypedLabel;
    case 'fallback-browser': return x.fallbackBrowserLabel;
  }
};

const choiceToTag = (choice: 'Simulated' | 'Browser speech' | 'Gnani Prisma v3.0'): ProviderTag =>
  choice === 'Simulated' ? 'simulated' : choice === 'Browser speech' ? 'browser' : 'gnani';

const localizeSpeakResult = (result: SpeakResult | null, language: Language) => {
  const x = extraCopy[language];
  if (!result) return x.speechNotPlayed;
  if (result.provider === 'gnani-timbre') return x.speechGnani;
  if (result.provider === 'browser-fallback') return x.speechBrowserFallback;
  if (result.provider === 'stopped') return x.speechStopped;
  return result.autoplayBlocked ? x.speechAutoplayBlocked : x.speechTextFallback;
};

const localizeSpeakFallbackNotice = (result: SpeakResult | null, language: Language): string | null => {
  if (!result || (result.provider !== 'browser-fallback' && result.provider !== 'text-only')) return null;
  const x = extraCopy[language];
  if (result.fallbackReason === 'rate-limited') {
    return result.provider === 'browser-fallback' ? x.ttsRateLimitedBrowserFallback : x.ttsRateLimitedTextFallback;
  }
  if (result.fallbackReason === 'unavailable') {
    return result.provider === 'browser-fallback' ? x.ttsUnavailableBrowserFallback : x.ttsUnavailableTextFallback;
  }
  return null;
};

export default function App() {
  const {
    language, dark, textSize, providerChoice, setProviderChoice, visits, referrals, followups,
    setLanguage, toggleDark, setTextSize, addReferral, addAuditEvent, updateReferralExcerpt, saveVisit, hydrateFromRemote, markFollowUpDone, resetDemo,
  } = useAppStore();
  const { worker, isDemoSession, supabaseMode, signOut, deleteAccount } = useAuth();
  const t = copy[language];
  const x = extraCopy[language];

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(seedBeneficiaries);
  const beneficiaryIdMapRef = useRef<Map<string, string>>(new Map());
  const [syncNotice, setSyncNotice] = useState('');
  const [screen, setScreen] = useState<Screen>('Home');
  const [person, setPerson] = useState<Beneficiary>(seedBeneficiaries[0]);
  const [fields, setFields] = useState<VisitFields>(emptyFields(seedBeneficiaries[0].id));
  const [visitTypeSource, setVisitTypeSource] = useState<VisitTypeSource | 'corrected'>('default');
  const [transcript, setTranscript] = useState('');
  const [alertCheckedTranscript, setAlertCheckedTranscript] = useState('');
  const [showDangerPicker, setShowDangerPicker] = useState(false);
  const [typedVisit, setTypedVisit] = useState('');
  const [showTypedFallback, setShowTypedFallback] = useState(false);
  const [gnaniConfigured, setGnaniConfigured] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineDraft[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [csvNotice, setCsvNotice] = useState('');
  const [reminderSpeech, setReminderSpeech] = useState<SpeakResult | null>(null);
  const [reminderTextShown, setReminderTextShown] = useState('');
  const [duplicateConflict, setDuplicateConflict] = useState<VisitRecord | null>(null);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [duplicateReasonError, setDuplicateReasonError] = useState('');
  const [search, setSearch] = useState('');
  const [correction, setCorrection] = useState('');
  const [corrections, setCorrections] = useState<VisitRecord['corrections']>([]);
  const [alertMatch, setAlertMatch] = useState<DangerMatch | null>(null);
  const [activeReferral, setActiveReferral] = useState<Referral | null>(null);
  const [alertVibration, setAlertVibration] = useState<VibrationResult | null>(null);
  const [alertSpeech, setAlertSpeech] = useState<SpeakResult | null>(null);
  const [readback, setReadback] = useState(false);
  const [saved, setSaved] = useState<VisitRecord | null>(null);
  const [savedOfflineNotice, setSavedOfflineNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sttState, setSttState] = useState<SttConnectionState>('idle');
  const [error, setError] = useState('');
  const [providerTag, setProviderTag] = useState<ProviderTag>(() => choiceToTag(providerChoice));
  const [showDiagnostics, setShowDiagnostics] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1',
  );
  const telemetry = useSyncExternalStore(subscribeVoiceTelemetry, getVoiceTelemetry);
  const providerRef = useRef<SpeechProvider | null>(null);
  const firedRules = useRef<Map<string, string>>(new Map());
  const alertPresented = useRef(false);
  const draftKeyRef = useRef<string>('');
  const alertCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const [district, setDistrict] = useState(demoDistricts[0]);
  const [block, setBlock] = useState(villages[0].block);
  const [villageId, setVillageId] = useState(villages[0].id);
  const [highlightFacility, setHighlightFacility] = useState(false);
  const [historyPerson, setHistoryPerson] = useState<Beneficiary>(seedBeneficiaries[0]);
  const [followTab, setFollowTab] = useState<'Upcoming' | 'Pending' | 'Overdue'>('Upcoming');
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [speechResult, setSpeechResult] = useState<SpeakResult | null>(null);

  // Sync <html lang="..."> with active language for screen readers
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Load remote Supabase workspace when configured & online
  useEffect(() => {
    if (supabaseMode !== 'supabase' || !worker) return;
    let cancelled = false;
    void fetchWorkspaceFromSupabase().then((snapshot) => {
      if (cancelled || !snapshot) return;
      beneficiaryIdMapRef.current = snapshot.beneficiaryIdMap;
      if (snapshot.beneficiaries.length > 0) {
        setBeneficiaries(snapshot.beneficiaries);
        setPerson((cur) => snapshot.beneficiaries.find((b) => b.id === cur.id) ?? snapshot.beneficiaries[0]);
      }
      hydrateFromRemote({
        visits: snapshot.visits,
        referrals: snapshot.referrals,
        followups: snapshot.followups,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [supabaseMode, worker, hydrateFromRemote]);

  const activeSyncTransport = useMemo(() => {
    if (supabaseMode !== 'supabase') return defaultSyncTransport;
    return createSupabaseSyncTransport({
      resolveBeneficiaryDbId: (code) => beneficiaryIdMapRef.current.get(code),
      onConflictResolved: (visit) => {
        setSyncNotice(`Synced ${visit.beneficiaryName} (${visit.fields.visitType}) using last-write-wins with audit log entry.`);
      },
      onSessionExpired: () => {
        setSyncNotice('Your session expired. Queued drafts remain safe on this device — please sign in again to sync.');
      },
    });
  }, [supabaseMode]);

  // Load IndexedDB offline draft queue on mount and stay synced on connectivity changes
  const refreshDrafts = useCallback(async () => {
    try {
      const list = await defaultDraftQueue.list();
      setOfflineDrafts(list);
    } catch {
      // Ignore storage read failures in restricted contexts
    }
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    setSyncBusy(true);
    try {
      const updated = await defaultDraftQueue.syncAll(activeSyncTransport, (next) => setOfflineDrafts(next));
      setOfflineDrafts(updated);
      for (const draft of updated) {
        if (draft.state === 'synced') {
          saveVisit(draft.visit);
        }
      }
    } finally {
      setSyncBusy(false);
    }
  }, [activeSyncTransport, saveVisit]);

  const retrySingleDraft = useCallback(
    async (idempotencyKey: string) => {
      setSyncBusy(true);
      try {
        const res = await defaultDraftQueue.syncOne(idempotencyKey, activeSyncTransport, (next) => setOfflineDrafts(next));
        const all = await defaultDraftQueue.list();
        setOfflineDrafts(all);
        if (res?.state === 'synced') saveVisit(res.visit);
      } finally {
        setSyncBusy(false);
      }
    },
    [activeSyncTransport, saveVisit],
  );

  useEffect(() => {
    void refreshDrafts();
    const handleOnline = () => {
      setIsOnline(true);
      void syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshDrafts, syncOfflineQueue]);

  useEffect(() => {
    let active = true;
    fetch('/api/gnani/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.configured === 'boolean') {
          setGnaniConfigured(data.configured);
        }
      })
      .catch(() => {
        if (active) setGnaniConfigured(false);
      });
    return () => { active = false; };
  }, []);

  // Warm ONLY the active language's danger alert WAV; read-back WAVs load lazily on demand (0 B on first load)
  useEffect(() => {
    void warmAlertAudioCache([language]);
  }, [language]);

  // Focus alert close button and allow Escape dismiss for keyboard accessibility
  useEffect(() => {
    if (!alertMatch) return;
    alertCloseBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAlert();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alertMatch]);

  function say(text: string, locale: Language = language, onResult?: (res: SpeakResult) => void) {
    const apply = (res: SpeakResult) => {
      setSpeechResult(res);
      onResult?.(res);
    };
    void speakText(text, locale, { onStatus: apply }).then(apply);
  }

  function sayAlert(text: string, locale: Language = language, onResult?: (res: SpeakResult) => void) {
    const apply = (res: SpeakResult) => {
      setSpeechResult(res);
      onResult?.(res);
    };
    void speakAlert(text, locale, { onStatus: apply }).then(apply);
  }

  function playTomorrowReminder() {
    const items = getTomorrowsFollowUps(followups, today, isoToday());
    const text = buildTomorrowReminderText(items, language);
    setReminderTextShown(text);
    const apply = (res: SpeakResult) => setReminderSpeech(res);
    void speakText(text, language, { onStatus: apply }).then(apply);
  }

  function handleCsvExport(kind: 'visits' | 'followups' | 'referrals') {
    const stamp = isoToday();
    if (kind === 'visits') triggerCsvDownload(`asha-sakhi-visits-${stamp}.csv`, visitsToCsv(visits));
    else if (kind === 'followups') triggerCsvDownload(`asha-sakhi-followups-${stamp}.csv`, followupsToCsv(followups));
    else triggerCsvDownload(`asha-sakhi-referrals-${stamp}.csv`, referralsToCsv(referrals));
    setCsvNotice(x.csvDownloaded);
  }

  const filtered = useMemo(
    () => beneficiaries.filter((b) => (b.name + ' ' + b.id).toLowerCase().includes(search.toLowerCase())),
    [search],
  );
  const todayVisits = visits.filter((v) => v.timestamp.slice(0, 10) === isoToday()).length;
  const overdueCount = followups.filter((f) => f.status !== 'Done' && (f.status === 'Overdue' || f.date < today)).length;
  const activeFollowups = followups.filter((f) => f.status !== 'Done').length;
  const pendingDraftCount = offlineDrafts.filter((d) => d.state === 'pending' || d.state === 'failed' || d.state === 'syncing').length;

  const visibleFollowups = useMemo(
    () =>
      followups.filter((f) => {
        if (f.status === 'Done') return false;
        if (followTab === 'Overdue') return f.status === 'Overdue' || f.date < today;
        if (followTab === 'Pending') return f.status === 'Pending' || (f.date === today && f.status !== 'Overdue');
        return f.status === 'Upcoming' && f.date > today;
      }),
    [followups, followTab],
  );

  const coverage = useMemo(() => {
    const village = villages.find((v) => v.id === villageId);
    const ids = village?.households.map((h) => h.beneficiaryId) ?? [];
    if (!ids.length) return 0;
    const completed = new Set(visits.filter((v) => ids.includes(v.beneficiaryId)).map((v) => v.beneficiaryId)).size;
    return Math.round((completed / ids.length) * 100);
  }, [visits, villageId]);

  function selectDistrict(nextDistrict: string) {
    setDistrict(nextDistrict);
    const match = villages.find((v) => v.district === nextDistrict);
    if (match) {
      setVillageId(match.id);
      setBlock(match.block);
    }
  }

  function selectBlock(nextBlock: string) {
    setBlock(nextBlock);
    const current = villages.find((v) => v.id === villageId);
    if (current && current.block === nextBlock) return;
    const match = villages.find((v) => v.block === nextBlock);
    if (match) {
      setVillageId(match.id);
      setDistrict(match.district);
    }
  }

  function selectVillage(nextVillageId: string) {
    setVillageId(nextVillageId);
    const match = villages.find((v) => v.id === nextVillageId);
    if (match) {
      setDistrict(match.district);
      setBlock(match.block);
    }
  }

  function startVisit(b: Beneficiary) {
    stopSpeaking();
    setPerson(b);
    setFields(emptyFields(b.id));
    setVisitTypeSource('default');
    setTranscript('');
    setAlertCheckedTranscript('');
    setShowDangerPicker(false);
    setTypedVisit('');
    setShowTypedFallback(!isOnline);
    setError('');
    setCorrections([]);
    setCorrection('');
    setCorrectionMessage('');
    setSaved(null);
    setSavedOfflineNotice(false);
    setDuplicateConflict(null);
    setDuplicateReason('');
    setDuplicateReasonError('');
    setReadback(false);
    setAlertMatch(null);
    setActiveReferral(null);
    setAlertVibration(null);
    setAlertSpeech(null);
    setSpeechResult(null);
    setSttState('idle');
    setProviderTag(!isOnline ? 'fallback-typed' : choiceToTag(providerChoice));
    updateVoiceTelemetry({ activeProvider: !isOnline ? x.fallbackTypedLabel : providerChoice, sttState: 'idle' });
    firedRules.current = new Map();
    alertPresented.current = false;
    draftKeyRef.current = `draft-${Date.now()}-${b.id}`;
    setScreen('Visit');
  }

  function referralFor(match: DangerMatch, excerpt: string, source: DangerSource = 'asr') {
    providerRef.current?.stop();
    const timestamp = new Date().toISOString();
    const referral: Referral = {
      id: 'REF-' + Date.now() + '-' + match.rule.id,
      ruleId: match.rule.id,
      category: match.rule.category,
      timestamp,
      facility: facility.name,
      status: 'Pending review',
      transcriptExcerpt: excerpt,
      needsReview: match.needsReview,
      beneficiaryId: person.id,
      source,
    };
    firedRules.current.set(match.rule.id, referral.id);
    addReferral(referral);
    if (supabaseMode === 'supabase') {
      const benDbId = beneficiaryIdMapRef.current.get(person.id);
      if (benDbId) {
        void createReferralRemote({
          beneficiaryDbId: benDbId,
          ruleId: match.rule.id,
          needsReview: match.needsReview,
          source,
          excerpt,
        }).then((remote) => {
          if (remote?.id) {
            setActiveReferral((cur) => (cur && cur.id === referral.id ? { ...cur, id: remote.id } : cur));
          }
        });
      }
    }
    addAuditEvent({
      id: 'AUD-' + Date.now() + '-' + match.rule.id,
      type: 'danger_triggered',
      timestamp,
      beneficiaryId: person.id,
      ruleId: match.rule.id,
      referralId: referral.id,
      source,
      transcriptUsed: excerpt,
    });
    setActiveReferral((old) => old ?? referral);
    if (!alertPresented.current) {
      alertPresented.current = true;
      setAlertMatch(match);
      setAlertVibration(triggerAlertVibration());
      setAlertSpeech(null);
      sayAlert(match.rule.wording[language], language, setAlertSpeech);
    }
  }

  function triggerManualDangerSign(rule: Rule) {
    setShowDangerPicker(false);
    const label = localizedRuleCategory(rule.id, rule.category, language);
    const excerpt = transcript.trim() ? `${transcript.trim()} · ${x.manualDangerExcerpt}: ${label}` : `${x.manualDangerExcerpt}: ${label}`;
    alertPresented.current = false;
    referralFor({ rule, phrase: label, needsReview: false }, excerpt, 'manual');
  }

  function processFinalText(text: string, tag: ProviderTag) {
    stopSpeaking();
    setError('');
    setSaved(null);
    setSavedOfflineNotice(false);
    setDuplicateConflict(null);
    setReadback(false);
    setProviderTag(tag);
    firedRules.current = new Map();
    alertPresented.current = false;
    setAlertMatch(null);
    setActiveReferral(null);
    setTranscript(text);
    setAlertCheckedTranscript(text);
    const matches = scanDangerSigns(text, person.kind, language, true);
    let dangerOccurred = false;
    for (const match of matches) {
      if (firedRules.current.has(match.rule.id)) continue;
      dangerOccurred = true;
      referralFor(match, text, 'asr');
    }
    const extracted = extractDetailed(text, person.id, today, person.kind);
    setFields(extracted.fields);
    setVisitTypeSource(extracted.visitTypeSource);
    if (!dangerOccurred) {
      setReadback(true);
      say(recordText(person, extracted.fields, language, extracted.visitTypeSource === 'context'), language);
    }
  }

  function fallbackMessageForError(err: unknown): string {
    if (err instanceof GnaniCaptureError) {
      switch (err.code) {
        case 'mic-denied': return x.micDeniedFallback;
        case 'mic-unavailable': return x.micUnavailableFallback;
        case 'offline': return x.offlineFallback;
        case 'no-speech': return x.noSpeechFallback;
        case 'gnani-error': return x.gnaniUnavailableFallback;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return x.offlineFallback;
    return x.gnaniUnavailableFallback;
  }

  async function runTranscript(input: string, choice: 'Simulated' | 'Browser speech' | 'Gnani Prisma v3.0' = 'Simulated') {
    stopSpeaking();
    setError('');
    setBusy(true);
    setReadback(false);
    setSaved(null);
    setSavedOfflineNotice(false);
    setDuplicateConflict(null);
    setTranscript('');
    setAlertCheckedTranscript('');
    firedRules.current = new Map();
    alertPresented.current = false;
    setAlertMatch(null);
    setActiveReferral(null);
    let latest = '';
    let dangerOccurred = false;

    if (choice === 'Gnani Prisma v3.0' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline(false);
      setBusy(false);
      setSttState('fallback');
      setProviderTag('fallback-typed');
      setShowTypedFallback(true);
      setError(x.offlineFallback);
      updateVoiceTelemetry({ activeProvider: x.fallbackTypedLabel, sttState: 'fallback', lastErrorCode: 'OFFLINE' });
      return;
    }

    if (choice === 'Gnani Prisma v3.0' && gnaniConfigured === false) {
      setBusy(false);
      setSttState('fallback');
      setProviderTag('fallback-typed');
      setShowTypedFallback(true);
      setError(x.gnaniUnavailableFallback);
      updateVoiceTelemetry({ activeProvider: x.fallbackTypedLabel, sttState: 'fallback', lastErrorCode: 'NOT_CONFIGURED' });
      return;
    }

    const provider: SpeechProvider =
      choice === 'Browser speech'
        ? new BrowserSpeechProvider()
        : choice.startsWith('Gnani')
          ? new GnaniProvider({ onStateChange: setSttState })
          : new SimulatedProvider();
    const phrase =
      input ||
      (choice === 'Simulated'
        ? 'Aaj mi Sunita cha ANC follow-up visit ghetla. Weight 55 kilo aahe. Pudhil visit 20 November la theva.'
        : '');
    providerRef.current = provider;
    setProviderTag(choiceToTag(choice));
    setSttState(choice.startsWith('Gnani') ? 'connecting' : 'listening');
    updateVoiceTelemetry({ activeProvider: provider.name, sttState: choice.startsWith('Gnani') ? 'connecting' : 'listening' });

    const handle = (partial: string, final = false) => {
      latest = partial;
      setTranscript(partial);
      setAlertCheckedTranscript(partial);
      const matches = scanDangerSigns(partial, person.kind, language, final);
      for (const match of matches) {
        const existingId = firedRules.current.get(match.rule.id);
        if (existingId) {
          updateReferralExcerpt(existingId, partial);
          setActiveReferral((old) => (old && old.id === existingId ? { ...old, transcriptExcerpt: partial } : old));
          continue;
        }
        dangerOccurred = true;
        referralFor(match, partial, 'asr');
      }
    };

    try {
      await provider.capture(phrase, language, (partial, isFinal) => handle(partial, Boolean(isFinal)));
      if (latest) handle(latest, true);
      if (!latest.trim()) {
        setError(x.noSpeechFallback);
        setShowTypedFallback(true);
        setProviderTag('fallback-typed');
        setSttState('fallback');
        updateVoiceTelemetry({ activeProvider: x.fallbackTypedLabel, sttState: 'fallback', lastErrorCode: 'NO_SPEECH' });
        setBusy(false);
        return;
      }
      const extracted = extractDetailed(latest, person.id, today, person.kind);
      setFields(extracted.fields);
      setVisitTypeSource(extracted.visitTypeSource);
      setBusy(false);
      setSttState('idle');
      updateVoiceTelemetry({ sttState: 'idle' });
      if (!dangerOccurred) {
        setReadback(true);
        say(recordText(person, extracted.fields, language, extracted.visitTypeSource === 'context'), language);
      }
    } catch (e) {
      setBusy(false);
      setProviderTag('fallback-typed');
      setSttState('fallback');
      setShowTypedFallback(true);
      setError(fallbackMessageForError(e));
      updateVoiceTelemetry({
        activeProvider: x.fallbackTypedLabel,
        sttState: 'fallback',
        lastErrorCode: e instanceof GnaniCaptureError ? (e.detailCode || e.code) : 'CAPTURE_ERROR',
      });
    }
  }

  function submitTypedVisit() {
    const trimmed = typedVisit.trim();
    if (!trimmed) return;
    processFinalText(trimmed, 'fallback-typed');
    setTypedVisit('');
  }

  function runDemo(type: 'normal' | 'emergency' | 'newborn' | 'negation' | 'ambiguous') {
    const line =
      type === 'normal'
        ? 'Aaj mi Sunita cha ANC follow-up visit ghetla. Weight 55 kilo aahe. Pudhil visit 20 November la theva.'
        : type === 'emergency'
          ? 'Pregnant woman la bleeding hot aahe.'
          : type === 'newborn'
            ? 'Baby has high fever and doodh pit nahi.'
            : type === 'negation'
              ? 'No bleeding reported.'
              : 'Maybe bleeding.';
    void runTranscript(line, 'Simulated');
  }

  function applyCorrection(text = correction) {
    const result = correctField(text, fields, new Date());
    if (!result) {
      setCorrectionMessage(x.correctionUnmatched);
      return;
    }
    const correctedPerson =
      result.correction.field === 'beneficiaryId'
        ? beneficiaries.find((b) => b.id === result.fields.beneficiaryId)
        : person;
    if (result.correction.field === 'beneficiaryId' && !correctedPerson) {
      setCorrectionMessage(x.unknownBeneficiary);
      return;
    }
    if (correctedPerson) setPerson(correctedPerson);
    setFields(result.fields);
    if (result.correction.field === 'visitType') setVisitTypeSource('corrected');
    setCorrections((current) => [...current, result.correction]);
    setTranscript((current) => (current ? current + ' · ' + text : text));
    setCorrection('');
    setCorrectionMessage(`${x.corrected}: ${result.correction.oldValue} → ${result.correction.newValue}`);
    const nextCtx = result.correction.field === 'visitType' ? false : visitTypeSource === 'context';
    say(recordText(correctedPerson ?? person, result.fields, language, nextCtx), language);
  }

  async function captureCorrection() {
    const provider = new BrowserSpeechProvider();
    let latest = '';
    providerRef.current = provider;
    setProviderTag('fallback-browser');
    setError('');
    setCorrectionMessage(x.correctionHint);
    setBusy(true);
    try {
      await provider.capture('', language, (partial) => {
        latest = partial;
        setCorrection(partial);
      });
      setBusy(false);
      if (!latest.trim()) {
        setCorrectionMessage(x.correctionError);
        return;
      }
      applyCorrection(latest);
    } catch {
      setBusy(false);
      setProviderTag('fallback-typed');
      setCorrectionMessage(x.correctionError);
    }
  }

  async function finalizeVisitSave(overrideReason?: string) {
    const timestamp = new Date().toISOString();
    const visitId = 'VIS-' + Date.now();
    const baseRecord: VisitRecord = {
      id: visitId,
      beneficiaryId: person.id,
      beneficiaryName: person.name,
      fields,
      timestamp,
      transcript,
      dangerSign: Boolean(activeReferral),
      needsReview: Boolean(activeReferral?.needsReview),
      referralId: activeReferral?.id,
      corrections,
      duplicateOverrideReason: overrideReason,
    };
    const idempotencyKey = draftKeyRef.current || makeVisitIdempotencyKey(baseRecord);
    const record: VisitRecord = { ...baseRecord, idempotencyKey };

    if (overrideReason && duplicateConflict) {
      addAuditEvent({
        id: 'AUD-' + Date.now() + '-DUP',
        type: 'duplicate_override',
        timestamp,
        beneficiaryId: person.id,
        visitType: fields.visitType,
        existingVisitId: duplicateConflict.id,
        reason: overrideReason,
      });
    }

    const currentlyOffline = (typeof navigator !== 'undefined' && navigator.onLine === false) || !isOnline || gnaniConfigured === false;
    saveVisit(record);
    if (currentlyOffline) {
      await defaultDraftQueue.enqueue(record, idempotencyKey);
      await refreshDrafts();
      setSavedOfflineNotice(true);
    } else if (supabaseMode === 'supabase') {
      const { draft } = await defaultDraftQueue.enqueue(record, idempotencyKey);
      const synced = await defaultDraftQueue.syncOne(draft.idempotencyKey, activeSyncTransport);
      await refreshDrafts();
      setSavedOfflineNotice(synced?.state !== 'synced');
    } else {
      setSavedOfflineNotice(false);
    }

    setDuplicateConflict(null);
    setDuplicateReason('');
    setDuplicateReasonError('');
    setSaved(record);
    setReadback(false);
  }

  function confirmVisit() {
    const existingDup = findSameDayDuplicateVisit(visits, person.id, fields.visitType, isoToday());
    if (existingDup) {
      setDuplicateConflict(existingDup);
      setDuplicateReasonError('');
      return;
    }
    void finalizeVisitSave();
  }

  function confirmDuplicateOverride() {
    const trimmed = duplicateReason.trim();
    if (!trimmed) {
      setDuplicateReasonError(x.duplicateReasonRequired);
      return;
    }
    void finalizeVisitSave(trimmed);
  }

  function closeAlert(toMap = false) {
    setAlertMatch(null);
    if (toMap) {
      setReadback(true);
      setHighlightFacility(true);
      setScreen('Map');
      return;
    }
    setReadback(true);
    say(recordText(person, fields, language), language);
  }

  const applicableDangerRules = useMemo(
    () => rules.filter((r) => r.appliesTo.includes(person.kind)),
    [person.kind],
  );
  const activeProviderLabel = localizeProviderTag(providerTag, language);
  const speechOutputLabel = localizeSpeakResult(speechResult, language);
  const readbackFallbackNotice = localizeSpeakFallbackNotice(speechResult, language);
  const alertSpeechLabel = localizeSpeakResult(alertSpeech, language);
  const alertFallbackNotice = localizeSpeakFallbackNotice(alertSpeech, language);
  const reminderSpeechLabel = localizeSpeakResult(reminderSpeech, language);
  const reminderFallbackNotice = localizeSpeakFallbackNotice(reminderSpeech, language);

  const nav: [Screen, typeof Home, string][] = [
    ['Home', Home, t.home],
    ['People', Users, t.people],
    ['Follow-ups', CalendarDays, t.followups],
    ['Map', MapPin, t.map],
    ['Referrals', ClipboardList, t.referrals],
  ];

  const queueStateLabel = (state: OfflineDraft['state']) =>
    state === 'pending' ? x.queuePending : state === 'syncing' ? x.queueSyncing : state === 'synced' ? x.queueSynced : x.queueFailed;

  const appClasses = [
    'app',
    dark ? 'dark' : '',
    textSize === 'large' ? 'text-large' : textSize === 'xlarge' ? 'text-xlarge' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={appClasses}>
      <a className="skip-link" href="#main-content">{x.skipToContent}</a>
      <main className="phone" id="main-content">
        <header className="top">
          <div className="brand">
            <span className="mark" aria-hidden="true"><Heart size={20} /></span>
            <span>ASHA <b>SAKHI</b></span>
          </div>
          <div className="topright">
            <span className="demo">{t.synthetic}</span>
            <label className="top-language">
              <span className="sr-only">Language</span>
              <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="en">EN</option>
                <option value="hi">हिंदी</option>
                <option value="mr">मराठी</option>
              </select>
            </label>
            <button type="button" className="icon" aria-label={t.settings} onClick={() => setScreen('Settings')}>
              <Settings size={19} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section key={screen} className="page page-enter">
          {isDemoSession && (
            <div className="demo-session-banner" role="status">
              <span><strong>Demo session</strong> · Synthetic workspace</span>
              <RouterLink to="/signup" className="demo-upgrade-link">Create an account to keep your data</RouterLink>
            </div>
          )}

          {syncNotice && (
            <div className="offline-banner" role="status" aria-live="polite">
              <small>{syncNotice}</small>
            </div>
          )}

          {(!isOnline || pendingDraftCount > 0) && (
            <div className="offline-banner" role="status" aria-live="polite" data-testid="offline-banner">
              <WifiOff size={15} aria-hidden="true" />
              <div>
                <strong>{!isOnline ? x.offlineBannerTitle : `${x.offlineQueueTitle} (${pendingDraftCount})`}</strong>
                <small>{!isOnline ? x.offlineBannerBody : x.offlineBannerShort}</small>
              </div>
              {isOnline && pendingDraftCount > 0 && (
                <button type="button" className="banner-sync" disabled={syncBusy} onClick={() => void syncOfflineQueue()}>
                  <RefreshCw size={13} aria-hidden="true" />{x.syncNow}
                </button>
              )}
            </div>
          )}

          <Suspense fallback={<div className="loading-state" role="status">{x.loadingScreen}</div>}>
            {screen === 'Home' && (
              <>
                <p className="eyebrow">{x.todayDate}</p>
                <h1>{t.hello}, {x.ashaName} <Sun size={20} aria-hidden="true" /></h1>
                <p className="sub">{t.tag}</p>
                <div className="progress-card">
                  <div className="ring">
                    <div><strong>{todayVisits}</strong><small>/ 5</small></div>
                  </div>
                  <div>
                    <b>{t.visits}</b>
                    <p>{todayVisits} / 5</p>
                    <div className="progress-line"><i style={{ width: Math.min(100, todayVisits * 20) + '%' }} /></div>
                  </div>
                </div>
                <div className="stats">
                  <button type="button" onClick={() => setScreen('Follow-ups')}><CalendarDays aria-hidden="true" /><b>{activeFollowups}</b><small>{t.followups}</small></button>
                  <button type="button" onClick={() => { setFollowTab('Overdue'); setScreen('Follow-ups'); }}><Activity aria-hidden="true" /><b>{overdueCount}</b><small>{t.overdue}</small></button>
                  <button type="button" onClick={() => setScreen('Referrals')}><AlertTriangle aria-hidden="true" /><b>{referrals.length}</b><small>{t.referrals}</small></button>
                </div>

                {/* P2 tools: Tomorrow's voice reminder + CSV export + Offline draft queue */}
                <div className="p2-panel" role="region" aria-label={x.csvExportTitle}>
                  <div className="p2-head">
                    <b>{x.voiceReminderTitle} &amp; {x.csvExportTitle}</b>
                    <span className="p2-badge">{x.phase2Badge}</span>
                  </div>
                  <div className="p2-actions">
                    <button type="button" className="secondary p2-btn" onClick={playTomorrowReminder}>
                      <Volume2 size={16} aria-hidden="true" /><span>{x.voiceReminderBtn}</span>
                    </button>
                    <button type="button" className="secondary p2-btn" onClick={() => handleCsvExport('visits')}>
                      <Download size={15} aria-hidden="true" /><span>{x.downloadVisitsCsv}</span>
                    </button>
                    <button type="button" className="secondary p2-btn" onClick={() => handleCsvExport('followups')}>
                      <Download size={15} aria-hidden="true" /><span>{x.downloadFollowupsCsv}</span>
                    </button>
                    <button type="button" className="secondary p2-btn" onClick={() => handleCsvExport('referrals')}>
                      <Download size={15} aria-hidden="true" /><span>{x.downloadReferralsCsv}</span>
                    </button>
                  </div>
                  {reminderTextShown && (
                    <div className="p2-status" role="status">
                      <span>{reminderTextShown}</span>
                      <small>{reminderSpeechLabel}</small>
                      {reminderFallbackNotice && <small className="tts-fallback-notice">{reminderFallbackNotice}</small>}
                    </div>
                  )}
                  {csvNotice && <small className="p2-csv-notice" role="status">{csvNotice}</small>}
                  {offlineDrafts.length > 0 && (
                    <div className="offline-queue-list" role="region" aria-label={x.offlineQueueTitle}>
                      <div className="p2-head">
                        <b>{x.offlineQueueTitle} ({offlineDrafts.length})</b>
                        {isOnline && pendingDraftCount > 0 && (
                          <button type="button" className="replay" disabled={syncBusy} onClick={() => void syncOfflineQueue()}>
                            <RefreshCw size={13} aria-hidden="true" />{x.syncNow}
                          </button>
                        )}
                      </div>
                      {offlineDrafts.map((draft) => (
                        <div key={draft.idempotencyKey} className="queue-row" data-draft-state={draft.state}>
                          <div>
                            <b>{draft.visit.beneficiaryName} · {localizeVisitType(draft.visit.fields.visitType, language)}</b>
                            <small>{draft.visit.fields.weight} · {queueStateLabel(draft.state)}{draft.lastError ? ` · ${draft.lastError}` : ''}</small>
                          </div>
                          {draft.state === 'failed' && (
                            <button type="button" className="replay" onClick={() => void retrySingleDraft(draft.idempotencyKey)}>
                              {x.retrySync}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="section-title"><h2>{t.nextUp}</h2><button type="button" onClick={() => setScreen('People')}>{t.all}</button></div>
                <div className="next-card">
                  <div className="avatar teal" aria-hidden="true">SP</div>
                  <div className="person-info">
                    <b>{beneficiaries[0].name}</b>
                    <small>{x.pregnant} · {localizeDue(beneficiaries[0].due, language)}</small>
                  </div>
                  <button type="button" className="round-arrow" aria-label={t.startVisit} onClick={() => startVisit(beneficiaries[0])}>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
                <div className="section-title"><h2>{t.today}</h2><button type="button" onClick={() => setScreen('People')}>{beneficiaries.length}</button></div>
                <BeneficiaryList
                  items={beneficiaries}
                  onStart={startVisit}
                  onHistory={(b) => { setHistoryPerson(b); setScreen('History'); }}
                  historyLabel={t.history}
                  language={language}
                />
              </>
            )}

            {screen === 'People' && (
              <>
                <PageTitle title={t.people} onBack={() => setScreen('Home')} backLabel={x.back} />
                <label className="searchbox">
                  <Search size={18} aria-hidden="true" />
                  <input aria-label={t.search} placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <BeneficiaryList
                  items={filtered}
                  onStart={startVisit}
                  onHistory={(b) => { setHistoryPerson(b); setScreen('History'); }}
                  historyLabel={t.history}
                  language={language}
                />
                {filtered.length === 0 && <Empty title={x.noMatches} text={x.searchHelp} />}
              </>
            )}

            {screen === 'History' && (
              <>
                <PageTitle title={historyPerson.name + ' · ' + t.history} onBack={() => setScreen('People')} backLabel={x.back} />
                {visits.filter((v) => v.beneficiaryId === historyPerson.id).length === 0 ? (
                  <Empty title={t.noHistory} text={historyPerson.id} />
                ) : (
                  visits
                    .filter((v) => v.beneficiaryId === historyPerson.id)
                    .map((v) => <VisitCard key={v.id} visit={v} t={t} language={language} />)
                )}
              </>
            )}

            {screen === 'Visit' && (
              <>
                <div className="visit-head">
                  <button type="button" className="icon" aria-label={x.back} onClick={() => setScreen('Home')}><ArrowLeft aria-hidden="true" /></button>
                  <div className="avatar teal small" aria-hidden="true">{person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                  <div className="person-info">
                    <h1 className="visit-person-name">{person.name}</h1>
                    <small>{person.id} · {extraCopy[language][person.kind.toLowerCase() as 'pregnant' | 'newborn' | 'child']}</small>
                  </div>
                  <span className="provider" data-provider-tag={providerTag}>{activeProviderLabel}</span>
                </div>

                <div className="steps" aria-hidden="true">
                  <span className="active">1 <small>{x.stepSpeak}</small></span><i />
                  <span className={readback ? 'active' : ''}>2 <small>{x.stepCheck}</small></span><i />
                  <span className={saved ? 'active' : ''}>3 <small>{x.stepConfirm}</small></span><i />
                  <span className={saved ? 'active' : ''}>4 <small>{x.stepSaved}</small></span>
                </div>

                <div className="mic-area">
                  <button
                    type="button"
                    className={busy ? 'mic listening' : 'mic'}
                    onClick={() => (busy ? providerRef.current?.stop() : void runTranscript('', providerChoice))}
                    aria-label={busy ? x.stopListening : x.startVoice}
                  >
                    <span className="mic-halo" aria-hidden="true" /><Mic size={32} aria-hidden="true" />
                  </button>
                  <b>
                    {sttState === 'connecting'
                      ? x.sttConnecting
                      : sttState === 'reconnecting'
                        ? x.sttReconnecting
                        : busy
                          ? t.listening
                          : t.listen}
                  </b>
                  <small data-stt-state={sttState}>
                    {activeProviderLabel}
                    {sttState === 'error' ? ` · ${x.sttErrorState}` : sttState === 'fallback' ? ` · ${x.sttFallbackState}` : ''}
                  </small>
                </div>

                {error && <div className="error" role="alert">{error}</div>}

                {showTypedFallback && (
                  <div className="typed-fallback" role="region" aria-label={x.typedFallbackHeading}>
                    <div className="card-label">{x.typedFallbackHeading}</div>
                    <div className="type-row">
                      <input
                        aria-label={x.typedFallbackHeading}
                        value={typedVisit}
                        onChange={(e) => setTypedVisit(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitTypedVisit(); }}
                        placeholder={x.typedVisitPlaceholder}
                      />
                      <button type="button" onClick={submitTypedVisit} aria-label={x.typedVisitSubmit}><Check size={18} aria-hidden="true" /></button>
                    </div>
                  </div>
                )}

                <div className="transcript">
                  <div className="card-label">
                    {x.liveTranscript}{' '}
                    <span>
                      {(sttState === 'connecting'
                        ? x.sttConnecting
                        : sttState === 'reconnecting'
                          ? x.sttReconnecting
                          : busy
                            ? x.listening
                            : x.ready).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="replay"
                      aria-label={t.listenTranscript}
                      onClick={() => transcript && say(transcript, language)}
                      disabled={!transcript}
                    >
                      <Volume2 size={16} aria-hidden="true" /><span>{t.listenTranscript}</span>
                    </button>
                  </div>
                  <p aria-live="polite" data-testid="alert-heard-line">
                    {transcript ? (
                      <>
                        <strong className="heard-prefix">{x.heardPrefix}: </strong>
                        <span>{alertCheckedTranscript || transcript}</span>
                      </>
                    ) : (
                      x.transcriptPlaceholder
                    )}
                    {busy && <i className="caret" aria-hidden="true" />}
                  </p>
                </div>

                <div className="danger-shortcut-wrap">
                  <button
                    type="button"
                    className="danger-shortcut"
                    aria-expanded={showDangerPicker}
                    onClick={() => setShowDangerPicker((open) => !open)}
                  >
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span>{x.dangerSignShortcut}</span>
                  </button>
                  {showDangerPicker && (
                    <div className="danger-picker" role="region" aria-label={x.dangerPickerTitle}>
                      <div className="danger-picker-head">
                        <b>{x.dangerPickerTitle}</b>
                        <small>{x.dangerPickerNote}</small>
                      </div>
                      {applicableDangerRules.length > 0 ? (
                        <div className="danger-picker-list">
                          {applicableDangerRules.map((rule) => (
                            <button
                              type="button"
                              key={rule.id}
                              data-rule-id={rule.id}
                              onClick={() => triggerManualDangerSign(rule)}
                            >
                              <strong>{rule.id}</strong>
                              <span>{localizedRuleCategory(rule.id, rule.category, language)}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <small className="danger-picker-none">{x.dangerPickerNone}</small>
                      )}
                    </div>
                  )}
                </div>

                <div className="field-grid">
                  <Field
                    label={t.beneficiaryId}
                    value={displayValue(fields.beneficiaryId, language)}
                    source={corrections.some((c) => c.field === 'beneficiaryId') ? x.corrected : x.heard}
                  />
                  <label className={'field select-field' + (visitTypeSource === 'context' ? ' needs-review' : '')}>
                    <small>{t.visitType}</small>
                    <select
                      aria-label={t.visitType}
                      value={fields.visitType}
                      onChange={(e) => {
                        setFields({ ...fields, visitType: e.target.value as VisitType });
                        setVisitTypeSource('corrected');
                      }}
                    >
                      {visitTypes.map((vt) => (
                        <option key={vt} value={vt}>{localizeVisitType(vt, language)}</option>
                      ))}
                    </select>
                    {visitTypeSource === 'context' && <em>{x.contextInferred}</em>}
                  </label>
                  <Field
                    label={t.weight}
                    value={displayValue(fields.weight, language)}
                    source={corrections.some((c) => c.field === 'weight') ? x.corrected : x.heard}
                    missing={fields.weight === 'Not captured'}
                    missingLabel={t.correct}
                  />
                  <Field
                    label={t.vaccinations}
                    value={displayValue(fields.vaccinationsDue, language)}
                    source={corrections.some((c) => c.field === 'vaccinationsDue') ? x.corrected : x.heard}
                  />
                  <Field
                    label={t.nextVisit}
                    value={displayValue(formattedDate(fields.nextVisitDate, language), language)}
                    source={corrections.some((c) => c.field === 'nextVisitDate') ? x.corrected : x.heard}
                    missing={fields.nextVisitDate === 'Not set'}
                    missingLabel={t.correct}
                  />
                </div>

                <details className="typed">
                  <summary role="button">{t.correct}</summary>
                  <p>{x.correctionHint}</p>
                  <button type="button" className="voice-correction" onClick={() => void captureCorrection()}>{x.voiceCorrection}</button>
                  <div className="type-row">
                    <input
                      aria-label={x.correctionAriaLabel}
                      value={correction}
                      onChange={(e) => setCorrection(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyCorrection(); }}
                      placeholder={x.correctionPlaceholder}
                    />
                    <button type="button" aria-label={t.correct} onClick={() => applyCorrection()}><Check size={18} aria-hidden="true" /></button>
                  </div>
                  <div className="sample-row">
                    <button type="button" onClick={() => applyCorrection(x.sampleWeightCorrection)}>{x.sampleWeightCorrection}</button>
                    <button type="button" onClick={() => applyCorrection(x.sampleDateCorrectionValue)}>{x.sampleDateCorrection}</button>
                  </div>
                  {correctionMessage && <small className="correction-message" role="status">{correctionMessage}</small>}
                </details>

                <details className="typed typed-note-disclosure">
                  <summary role="button">{x.typedFallbackHeading}</summary>
                  <div className="type-row">
                    <input
                      aria-label={x.typedVisitPlaceholder}
                      value={typedVisit}
                      onChange={(e) => setTypedVisit(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitTypedVisit(); }}
                      placeholder={x.typedVisitPlaceholder}
                    />
                    <button type="button" onClick={submitTypedVisit} aria-label={x.typedVisitSubmit}><Check size={18} aria-hidden="true" /></button>
                  </div>
                </details>

                <div className="sample-row demo-actions">
                  <button type="button" onClick={() => runDemo('normal')}><span>{t.normal}</span><small>{x.simulatedLabel}</small></button>
                  <button type="button" onClick={() => runDemo('emergency')}><span>{t.emergency}</span><small>{x.simulatedLabel}</small></button>
                  {person.kind === 'Pregnant' && (
                    <>
                      <button type="button" onClick={() => runDemo('negation')}><span>{x.noBleeding.split(' · ')[0]}</span><small>{x.simulatedLabel}</small></button>
                      <button type="button" onClick={() => runDemo('ambiguous')}><span>{x.maybeBleeding.split(' · ')[0]}</span><small>{x.simulatedLabel}</small></button>
                    </>
                  )}
                  {person.kind === 'Newborn' && (
                    <button type="button" onClick={() => runDemo('newborn')}><span>{t.sampleBaby}</span><small>{x.simulatedLabel}</small></button>
                  )}
                </div>

                {readback && !saved && (
                  <div className="readback">
                    <div className="card-label">
                      <Volume2 size={15} aria-hidden="true" />{t.review}
                      <small className="speech-provider" role="status">{speechOutputLabel}</small>
                    </div>
                    {readbackFallbackNotice && (
                      <div className="tts-fallback-notice" role="status" data-fallback-reason={speechResult?.fallbackReason}>
                        {readbackFallbackNotice}
                      </div>
                    )}
                    <div className="record-summary">
                      {([
                        [t.beneficiaryId, displayValue(fields.beneficiaryId, language)],
                        [
                          t.visitType,
                          localizeVisitType(fields.visitType, language) + (visitTypeSource === 'context' ? ` (${x.contextInferred})` : ''),
                        ],
                        [t.weight, displayValue(fields.weight, language)],
                        [t.vaccinations, displayValue(fields.vaccinationsDue, language)],
                        [t.nextVisit, displayValue(formattedDate(fields.nextVisitDate, language), language)],
                      ] as string[][]).map((row) => (
                        <div key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
                      ))}
                    </div>
                    {activeReferral && (
                      <p className="danger-flag">
                        <AlertTriangle size={15} aria-hidden="true" />{t.danger} · {activeReferral.ruleId} · {t.referrals} {activeReferral.id}
                      </p>
                    )}
                    <button type="button" className="replay full-replay" onClick={() => say(recordText(person, fields, language, visitTypeSource === 'context'), language)}>
                      <Volume2 size={16} aria-hidden="true" />{t.listenTranscript}
                    </button>
                    <div className="correction-history">
                      {corrections.map((c, i) => (
                        <p key={i}>
                          {localizeFieldName(c.field, language)}: {displayValue(c.oldValue, language)} → {displayValue(c.newValue, language)} ·{' '}
                          {new Date(c.timestamp).toLocaleTimeString(language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      ))}
                    </div>

                    {duplicateConflict && (
                      <div className="duplicate-warning" role="alert" data-testid="duplicate-warning">
                        <div className="p2-head">
                          <b><AlertTriangle size={14} aria-hidden="true" /> {x.duplicateWarningTitle}</b>
                          <span className="p2-badge">{x.phase2Badge}</span>
                        </div>
                        <p>{x.duplicateWarningBody}</p>
                        <label className="dup-label">
                          {x.duplicateReasonLabel}
                          <input
                            aria-label={x.duplicateReasonLabel}
                            value={duplicateReason}
                            onChange={(e) => { setDuplicateReason(e.target.value); setDuplicateReasonError(''); }}
                            placeholder={x.duplicateReasonPlaceholder}
                          />
                        </label>
                        <div className="sample-row">
                          <button type="button" onClick={() => { setDuplicateReason(x.duplicateQuickRecheck); setDuplicateReasonError(''); }}>{x.duplicateQuickRecheck}</button>
                          <button type="button" onClick={() => { setDuplicateReason(x.duplicateQuickCorrection); setDuplicateReasonError(''); }}>{x.duplicateQuickCorrection}</button>
                        </div>
                        {duplicateReasonError && <small className="dup-err">{duplicateReasonError}</small>}
                        <div className="read-actions">
                          <button type="button" className="secondary" onClick={() => { setDuplicateConflict(null); setDuplicateReason(''); }}>{t.cancel}</button>
                          <button type="button" className="primary" onClick={confirmDuplicateOverride}>{x.duplicateOverrideSave}</button>
                        </div>
                      </div>
                    )}

                    {!duplicateConflict && (
                      <div className="read-actions">
                        <button type="button" className="secondary" onClick={() => document.querySelector('details.typed')?.setAttribute('open', '')}>{t.fix}</button>
                        <button type="button" className="primary" onClick={confirmVisit}><Check size={17} aria-hidden="true" />{t.confirm}</button>
                      </div>
                    )}
                  </div>
                )}

                {saved && (
                  <div className="saved" role="status">
                    <div className="saved-check" aria-hidden="true"><Check /></div>
                    <div>
                      <h2>{t.recordSaved}</h2>
                      <p>
                        {saved.dangerSign ? t.danger + ' · ' : ''}
                        {savedOfflineNotice ? x.offlineBannerShort + ' · ' : ''}
                        {t.nextVisit}: {displayValue(formattedDate(saved.fields.nextVisitDate, language), language)}
                      </p>
                    </div>
                    <button type="button" onClick={() => startVisit(beneficiaries[(beneficiaries.findIndex((b) => b.id === person.id) + 1) % beneficiaries.length])}>
                      {t.nextUp} <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            )}

            {screen === 'Follow-ups' && (
              <>
                <PageTitle title={t.followups} onBack={() => setScreen('Home')} backLabel={x.back} />
                <div className="reminder-bar">
                  <button type="button" className="secondary p2-btn" onClick={playTomorrowReminder}>
                    <Volume2 size={16} aria-hidden="true" /><span>{x.voiceReminderBtn}</span>
                    <span className="p2-badge">{x.phase2Badge}</span>
                  </button>
                  {reminderTextShown && (
                    <div className="p2-status" role="status">
                      <span>{reminderTextShown}</span>
                      <small>{reminderSpeechLabel}</small>
                      {reminderFallbackNotice && <small className="tts-fallback-notice">{reminderFallbackNotice}</small>}
                    </div>
                  )}
                </div>
                <div className="tabs" role="group" aria-label={t.followups}>
                  {(['Upcoming', 'Pending', 'Overdue'] as const).map((tab) => (
                    <button type="button" aria-pressed={followTab === tab} key={tab} className={followTab === tab ? 'selected' : ''} onClick={() => setFollowTab(tab)}>
                      {t[tab.toLowerCase() as 'upcoming' | 'pending' | 'overdue']}
                    </button>
                  ))}
                </div>
                {visibleFollowups.length ? (
                  visibleFollowups.map((f) => (
                    <FollowUpCard
                      key={f.id}
                      followup={f}
                      done={() => {
                        markFollowUpDone(f.id);
                        if (supabaseMode === 'supabase') void markFollowUpDoneRemote(f.id);
                      }}
                      doneLabel={x.markDone}
                      statusLabel={t[f.status.toLowerCase() as 'upcoming' | 'pending' | 'overdue' | 'done']}
                    />
                  ))
                ) : (
                  <Empty title={t.followups} text={x.followupEmpty} />
                )}
              </>
            )}

            {screen === 'Referrals' && (
              <>
                <PageTitle title={t.referrals} onBack={() => setScreen('Home')} backLabel={x.back} />
                {referrals.length ? (
                  referrals.map((r) => <ReferralCard key={r.id} referral={r} t={t} language={language} />)
                ) : (
                  <Empty title={t.noReferrals} text={x.noReferralDetails} />
                )}
              </>
            )}

            {screen === 'Map' && (
              <MapScreen
                language={language}
                visits={visits}
                referrals={referrals}
                district={district}
                block={block}
                villageId={villageId}
                coverage={coverage}
                highlightFacility={highlightFacility}
                onBack={() => setScreen('Home')}
                onSelectDistrict={selectDistrict}
                onSelectBlock={selectBlock}
                onSelectVillage={selectVillage}
                onSelectHousehold={setPerson}
                onCloseFacility={() => setHighlightFacility(false)}
                onBackToDraft={() => {
                  setHighlightFacility(false);
                  setScreen('Visit');
                  say(recordText(person, fields, language), language);
                }}
              />
            )}

            {screen === 'Settings' && (
              <SettingsScreen
                language={language}
                dark={dark}
                textSize={textSize}
                providerChoice={providerChoice}
                showDiagnostics={showDiagnostics}
                telemetry={telemetry}
                worker={worker}
                isDemoSession={isDemoSession}
                supabaseMode={supabaseMode}
                onBack={() => setScreen('Home')}
                onSetLanguage={setLanguage}
                onSetProviderChoice={(choice) => {
                  setProviderChoice(choice);
                  setProviderTag(choiceToTag(choice));
                }}
                onToggleDark={toggleDark}
                onSetTextSize={setTextSize}
                onOpenAbout={() => setScreen('About')}
                onReset={() => {
                  resetDemo();
                  void defaultDraftQueue.clear().then(refreshDrafts);
                  setProviderTag('gnani');
                  setScreen('Home');
                }}
                onSignOut={() => {
                  void signOut().then(() => navigate('/login', { replace: true }));
                }}
                onDeleteAccount={async () => {
                  await deleteAccount();
                  await defaultDraftQueue.clear();
                  navigate('/', { replace: true });
                }}
                onCreateAccount={() => navigate('/signup')}
                onToggleDiagnostics={() => setShowDiagnostics((open) => !open)}
              />
            )}

            {screen === 'About' && (
              <AboutScreen language={language} onBack={() => setScreen('Settings')} />
            )}
          </Suspense>
        </section>

        <nav className="bottom" aria-label={x.primaryNav}>
          {nav.map(([name, Icon, label]) => (
            <button type="button" key={name} aria-current={screen === name ? 'page' : undefined} className={screen === name ? 'on' : ''} onClick={() => setScreen(name)}>
              <Icon size={21} aria-hidden="true" /><small>{label}</small>
            </button>
          ))}
        </nav>
      </main>

      <aside className="desktop-note" aria-label={x.desktopLine1}>
        <b>ASHA SAKHI</b>
        <p>{x.desktopLine1}<br />{x.desktopLine2}</p>
        <span>{t.synthetic}</span>
      </aside>

      {alertMatch && activeReferral && (
        <div
          className="alert-overlay alert-enter"
          role="alertdialog"
          aria-live="assertive"
          aria-modal="true"
          aria-labelledby="alert-dialog-title"
        >
          <div className="alert-content">
            <button ref={alertCloseBtnRef} type="button" className="close-alert" aria-label={t.cancel} onClick={() => closeAlert()}><X aria-hidden="true" /></button>
            <div className="alert-pulse" aria-hidden="true"><AlertTriangle size={34} /></div>
            <span className="urgent">{t.danger} · {alertMatch.rule.id}</span>
            <h1 id="alert-dialog-title">{t.danger}</h1>
            <p className="alert-local">{alertMatch.rule.wording[language]}</p>

            <div className="alert-feedback" role="status">
              <small>{alertVibration?.triggered ? x.alertVibrationActive : x.alertVibrationFallback}</small>
              <small>{alertSpeechLabel}</small>
              {alertFallbackNotice && (
                <small className="tts-fallback-notice" data-fallback-reason={alertSpeech?.fallbackReason}>
                  {alertFallbackNotice}
                </small>
              )}
              {alertSpeech?.provider === 'text-only' && <small>{x.alertAudioFallback}</small>}
              <button
                type="button"
                className="replay alert-replay"
                onClick={() => sayAlert(alertMatch.rule.wording[language], language, setAlertSpeech)}
              >
                <Volume2 size={15} aria-hidden="true" /><span>{x.playAlertAudio}</span>
              </button>
            </div>

            <div className="matched"><b>{t.matched}</b><p>{activeReferral.transcriptExcerpt}</p></div>
            {alertMatch.needsReview && <div className="rule-info">{t.maybeReview}</div>}
            <div className="rule-info">
              <b>{t.rule} {activeReferral.ruleId} · {localizedRuleCategory(activeReferral.ruleId, activeReferral.category, language)}</b>
              <small>{activeReferral.timestamp} · {t.pendingReview} · {activeReferral.source === 'manual' ? x.sourceManual : x.sourceAsr}</small>
              <small>{x.ruleSource}</small>
            </div>
            <div className="referral-card">
              <span className="ref-icon" aria-hidden="true"><ClipboardList /></span>
              <div>
                <b>{t.referralCreated}</b>
                <small>{activeReferral.id} · {t.pendingReview}</small>
                <small>{activeReferral.facility} · {t.sampleFacility}</small>
              </div>
            </div>
            <button type="button" className="call"><Phone aria-hidden="true" />{t.callPhc}</button>
            <button type="button" className="secondary full" onClick={() => closeAlert(true)}>{t.nearestPhc} <MapPin size={17} aria-hidden="true" /></button>
            <button type="button" className="primary full" onClick={() => closeAlert()}>{t.backDraft} <ChevronRight aria-hidden="true" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function PageTitle({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <div className="page-title">
      <button type="button" className="icon" aria-label={backLabel} onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
      <h1>{title}</h1>
    </div>
  );
}

function BeneficiaryList({
  items, onStart, onHistory, historyLabel, language,
}: {
  items: Beneficiary[];
  onStart: (b: Beneficiary) => void;
  onHistory: (b: Beneficiary) => void;
  historyLabel: string;
  language: Language;
}) {
  return (
    <div className="beneficiaries">
      {items.map((b, i) => (
        <div className="beneficiary-row" key={b.id}>
          <button type="button" className="beneficiary" onClick={() => onStart(b)}>
            <div className={'avatar ' + (i % 2 ? 'peach' : 'teal')} aria-hidden="true">{b.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
            <div className="person-info">
              <b>{b.name}</b>
              <small>
                {extraCopy[language][b.kind.toLowerCase() as 'pregnant' | 'newborn' | 'child']} · {localizeAge(b.age, language)} · {b.id}
              </small>
            </div>
            <span className="due">{localizeDue(b.due, language)}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="history-link" onClick={() => onHistory(b)}>{historyLabel}</button>
        </div>
      ))}
    </div>
  );
}

function Field({
  label, value, source, missing = false, missingLabel,
}: {
  label: string; value: string; source: string; missing?: boolean; missingLabel?: string;
}) {
  return (
    <div className={'field filled' + (missing ? ' needs-review' : '')}>
      <small>{label}</small>
      <b>{value}</b>
      <em>{missing ? missingLabel : source}</em>
      {missing ? <AlertTriangle size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span aria-hidden="true"><ClipboardList /></span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function FollowUpCard({
  followup, done, doneLabel, statusLabel,
}: {
  followup: FollowUp; done: () => void; doneLabel: string; statusLabel: string;
}) {
  return (
    <div className="list-card">
      <div className="date-badge">{followup.date.slice(8, 10)}<small>{followup.date.slice(5, 7)}</small></div>
      <div className="person-info">
        <b>{followup.beneficiaryName}</b>
        <small>{followup.date} · {statusLabel}</small>
      </div>
      <button type="button" className="secondary" onClick={done}>{doneLabel}</button>
    </div>
  );
}

function ReferralCard({ referral, t, language }: { referral: Referral; t: Record<string, string>; language: Language }) {
  return (
    <div className="referral-card timeline-card">
      <span className="ref-icon" aria-hidden="true"><AlertTriangle /></span>
      <div>
        <b>{referral.ruleId} · {localizedRuleCategory(referral.ruleId, referral.category, language)}</b>
        <small>{new Date(referral.timestamp).toLocaleString(language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN')}</small>
        <small>{referral.facility} · {t.pendingReview} · {referral.source === 'manual' ? extraCopy[language].sourceManual : extraCopy[language].sourceAsr}</small>
        <small>{referral.transcriptExcerpt}</small>
        {referral.needsReview && <small>{t.maybeReview}</small>}
      </div>
    </div>
  );
}

function VisitCard({ visit, t, language }: { visit: VisitRecord; t: Record<string, string>; language: Language }) {
  return (
    <div className="visit-history">
      <button
        type="button"
        className="history-toggle"
        onClick={(e) => {
          const next = e.currentTarget.nextElementSibling as HTMLElement;
          next.hidden = !next.hidden;
        }}
      >
        <b>{visit.timestamp.slice(0, 10)} · {localizeVisitType(visit.fields.visitType, language)}</b>
        <ChevronRight aria-hidden="true" />
      </button>
      <div hidden>
        <p>
          {displayValue(visit.fields.weight, language)} · {displayValue(visit.fields.vaccinationsDue, language)} ·{' '}
          {displayValue(formattedDate(visit.fields.nextVisitDate, language), language)}
        </p>
        {visit.dangerSign && <strong>{t.danger} · {visit.referralId}</strong>}
        {visit.duplicateOverrideReason && <p><em>{visit.duplicateOverrideReason}</em></p>}
        {visit.corrections.map((c, i) => (
          <p key={i}>
            {localizeFieldName(c.field, language)}: {displayValue(c.oldValue, language)} → {displayValue(c.newValue, language)} ·{' '}
            {new Date(c.timestamp).toLocaleString(language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN')}
          </p>
        ))}
        <p>{visit.transcript}</p>
      </div>
    </div>
  );
}
