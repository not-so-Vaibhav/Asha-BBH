import { useState } from 'react';
import { ArrowLeft, ChevronRight, LogOut, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import type { WorkerProfile } from '../auth/AuthContext';
import { copy, extraCopy } from '../data/i18n';
import type { Language, TextSize } from '../domain/types';
import { RouterLink } from '../router';
import type { VoiceTelemetry } from '../voice/telemetry';

type Props = {
  language: Language;
  dark: boolean;
  textSize: TextSize;
  providerChoice: 'Simulated' | 'Browser speech' | 'Gnani Prisma v3.0';
  showDiagnostics: boolean;
  telemetry: VoiceTelemetry;
  worker: WorkerProfile | null;
  isDemoSession: boolean;
  supabaseMode: 'supabase' | 'local-preview';
  onBack: () => void;
  onSetLanguage: (lang: Language) => void;
  onSetProviderChoice: (choice: 'Simulated' | 'Browser speech' | 'Gnani Prisma v3.0') => void;
  onToggleDark: () => void;
  onSetTextSize: (size: TextSize) => void;
  onOpenAbout: () => void;
  onReset: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
  onCreateAccount: () => void;
  onToggleDiagnostics: () => void;
};

export default function SettingsScreen({
  language,
  dark,
  textSize,
  providerChoice,
  showDiagnostics,
  telemetry,
  worker,
  isDemoSession,
  supabaseMode,
  onBack,
  onSetLanguage,
  onSetProviderChoice,
  onToggleDark,
  onSetTextSize,
  onOpenAbout,
  onReset,
  onSignOut,
  onDeleteAccount,
  onCreateAccount,
  onToggleDiagnostics,
}: Props) {
  const t = copy[language];
  const x = extraCopy[language];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <div className="page-title">
        <button type="button" className="icon" aria-label={x.back} onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1>{t.settings}</h1>
      </div>

      {worker && (
        <section className="account-card" aria-label="Worker account">
          <div className="account-card-head">
            <span className="account-avatar" aria-hidden="true">
              <UserCheck size={18} />
            </span>
            <div>
              <b>{worker.displayName}</b>
              <small>
                {worker.ashaIdDemo} · {worker.areaName} · {worker.role}
              </small>
              <small>
                {isDemoSession
                  ? 'Demo session (isolated sandbox · expires after 7 days)'
                  : worker.email || 'Signed-in worker'}
                {' · '}
                {supabaseMode === 'supabase' ? 'Supabase RLS' : 'Local preview'}
              </small>
            </div>
          </div>
          {isDemoSession && (
            <button type="button" className="primary full" onClick={onCreateAccount}>
              Create an account to keep your data
            </button>
          )}
        </section>
      )}

      <h2>{t.preferences}</h2>
      <label className="setting">
        {t.language}
        <select aria-label="Language" value={language} onChange={(e) => onSetLanguage(e.target.value as Language)}>
          <option value="en">English</option>
          <option value="hi">हिंदी</option>
          <option value="mr">मराठी</option>
        </select>
      </label>
      <label className="setting">
        {t.provider}
        <select
          aria-label={t.provider}
          value={providerChoice}
          onChange={(e) => onSetProviderChoice(e.target.value as typeof providerChoice)}
        >
          <option value="Simulated">{x.simulatedLabel}</option>
          <option value="Browser speech">{x.browserSpeechLabel}</option>
          <option value="Gnani Prisma v3.0">{x.gnaniLabel}</option>
        </select>
      </label>
      <label className="setting">
        {x.textSize}
        <select aria-label={x.textSize} value={textSize} onChange={(e) => onSetTextSize(e.target.value as TextSize)}>
          <option value="normal">{x.textNormal}</option>
          <option value="large">{x.textLarge}</option>
          <option value="xlarge">{x.textXLarge}</option>
        </select>
      </label>
      <button type="button" className="setting" onClick={onToggleDark}>
        {t.darkMode} <span>{dark ? x.on : x.off}</span>
      </button>
      <button type="button" className="setting" onClick={onOpenAbout}>
        {x.openAbout} <ChevronRight size={18} aria-hidden="true" />
      </button>
      <RouterLink to="/privacy" className="setting setting-link">
        <span>
          <ShieldCheck size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Privacy &amp; data handling
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </RouterLink>
      <button type="button" className="setting reset-setting" onClick={onReset}>
        {t.reset}
      </button>
      <button type="button" className="setting" onClick={onSignOut}>
        <span>
          <LogOut size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Log out
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      {!confirmDelete ? (
        <button type="button" className="setting danger-setting" onClick={() => setConfirmDelete(true)}>
          <span>
            <Trash2 size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Delete account
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ) : (
        <div className="delete-confirm-box" role="alertdialog" aria-label="Confirm account deletion">
          <b>Delete your profile and all synthetic workspace rows?</b>
          <small>This permanently removes your worker profile, visits, follow-ups, and referrals.</small>
          <div className="delete-confirm-actions">
            <button
              type="button"
              className="secondary"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="call"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await onDeleteAccount();
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? 'Deleting…' : 'Yes, delete account'}
            </button>
          </div>
        </div>
      )}

      <p className="sub">
        {t.synthetic} · {x.savedOnDevice}{' '}
        <button
          type="button"
          className="debug-toggle"
          aria-expanded={showDiagnostics}
          onClick={onToggleDiagnostics}
        >
          {x.diagnosticsTitle}
        </button>
      </p>
      {showDiagnostics && (
        <div className="debug-panel" role="region" aria-label={x.diagnosticsTitle}>
          <b>{x.diagnosticsTitle}</b>
          <small>{x.diagnosticsNote}</small>
          <dl>
            <div><dt>Provider</dt><dd>{telemetry.activeProvider}</dd></div>
            <div><dt>STT state</dt><dd>{telemetry.sttState}</dd></div>
            <div><dt>First partial</dt><dd>{telemetry.timeToFirstPartialMs !== null ? `${telemetry.timeToFirstPartialMs} ms` : '—'}</dd></div>
            <div><dt>Final transcript</dt><dd>{telemetry.timeToFinalMs !== null ? `${telemetry.timeToFinalMs} ms` : '—'}</dd></div>
            <div><dt>Timbre latency</dt><dd>{telemetry.timbreLatencyMs !== null ? `${telemetry.timbreLatencyMs} ms${telemetry.timbreCached ? ' (cached)' : ''}` : '—'}</dd></div>
            <div><dt>Reconnects</dt><dd>{telemetry.reconnectCount}</dd></div>
            <div><dt>Last error code</dt><dd>{telemetry.lastErrorCode ?? 'none'}</dd></div>
          </dl>
        </div>
      )}
    </>
  );
}
