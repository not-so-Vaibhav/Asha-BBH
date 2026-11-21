import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuditEvent, FollowUp, Language, Referral, TextSize, VisitRecord } from '../domain/types';

export const DEMO_TODAY = '2026-11-13';

export function followUpStatusForDate(date: string, today = DEMO_TODAY): FollowUp['status'] {
  if (date < today) return 'Overdue';
  if (date === today) return 'Pending';
  return 'Upcoming';
}

type Store = {
  language: Language;
  dark: boolean;
  textSize: TextSize;
  providerChoice: 'Simulated' | 'Browser speech' | 'Gnani Prisma v3.0';
  visits: VisitRecord[];
  referrals: Referral[];
  followups: FollowUp[];
  auditLog: AuditEvent[];
  setLanguage: (language: Language) => void;
  toggleDark: () => void;
  setTextSize: (size: TextSize) => void;
  setProviderChoice: (provider: 'Simulated' | 'Browser speech' | 'Gnani Prisma v3.0') => void;
  addReferral: (referral: Referral) => void;
  addAuditEvent: (event: AuditEvent) => void;
  updateReferralExcerpt: (id: string, transcriptExcerpt: string) => void;
  saveVisit: (record: VisitRecord) => void;
  hydrateFromRemote: (data: { visits: VisitRecord[]; referrals: Referral[]; followups: FollowUp[] }) => void;
  markFollowUpDone: (id: string) => void;
  linkReferral: (id: string, visitId: string) => void;
  resetDemo: () => void;
};

const emptyVisits: VisitRecord[] = [];

export const useAppStore = create<Store>()(
  persist(
    (set, get) => ({
      language: 'en',
      dark: false,
      textSize: 'normal',
      providerChoice: 'Gnani Prisma v3.0',
      visits: emptyVisits,
      referrals: [],
      followups: [],
      auditLog: [],
      setLanguage: (language) => set({ language }),
      toggleDark: () => set((s) => ({ dark: !s.dark })),
      setTextSize: (textSize) => set({ textSize }),
      setProviderChoice: (providerChoice) => set({ providerChoice }),
      addReferral: (referral) => {
        if (!get().referrals.some((r) => r.id === referral.id)) {
          set((s) => ({ referrals: [referral, ...s.referrals] }));
        }
      },
      addAuditEvent: (event) =>
        set((s) => ({ auditLog: [event, ...s.auditLog].slice(0, 200) })),
      updateReferralExcerpt: (id, transcriptExcerpt) =>
        set((s) => ({
          referrals: s.referrals.map((r) => (r.id === id ? { ...r, transcriptExcerpt } : r)),
        })),
      saveVisit: (record) => {
        const exists = get().visits.some(
          (v) => v.id === record.id || (Boolean(record.idempotencyKey) && v.idempotencyKey === record.idempotencyKey),
        );
        if (exists) return;
        const date = record.fields.nextVisitDate;
        const nextFollowUp: FollowUp | undefined =
          date && date !== 'Not set'
            ? {
                id: 'FU-' + record.id,
                beneficiaryId: record.beneficiaryId,
                beneficiaryName: record.beneficiaryName,
                date,
                status: followUpStatusForDate(date),
                visitId: record.id,
              }
            : undefined;
        set((s) => ({
          visits: [record, ...s.visits],
          followups: nextFollowUp ? [nextFollowUp, ...s.followups] : s.followups,
        }));
        if (record.referralId) get().linkReferral(record.referralId, record.id);
      },
      hydrateFromRemote: ({ visits, referrals, followups }) =>
        set({ visits, referrals, followups }),
      markFollowUpDone: (id) =>
        set((s) => ({
          followups: s.followups.map((f) => (f.id === id ? { ...f, status: 'Done' } : f)),
        })),
      linkReferral: (id, visitId) =>
        set((s) => ({
          referrals: s.referrals.map((r) => (r.id === id ? { ...r, visitId } : r)),
        })),
      resetDemo: () =>
        set({
          visits: [],
          referrals: [],
          followups: [],
          auditLog: [],
          language: 'en',
          dark: false,
          textSize: 'normal',
          providerChoice: 'Gnani Prisma v3.0',
        }),
    }),
    {
      name: 'asha-sakhi-demo',
      partialize: (state) => ({
        language: state.language,
        dark: state.dark,
        textSize: state.textSize,
        providerChoice: state.providerChoice,
        visits: state.visits,
        referrals: state.referrals,
        followups: state.followups,
        auditLog: state.auditLog,
      }),
    },
  ),
);
