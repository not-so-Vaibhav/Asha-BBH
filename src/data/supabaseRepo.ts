import type { Beneficiary, BeneficiaryKind, FollowUp, Referral, VisitFields, VisitRecord, VisitType } from '../domain/types';
import { getActiveAccessToken, getSupabase } from '../lib/supabase';
import type { OfflineDraft, SyncTransport } from '../offline/draftQueue';
import { followUpStatusForDate } from '../store/useAppStore';

const dbKindToApp: Record<'pregnant' | 'newborn' | 'child', BeneficiaryKind> = {
  pregnant: 'Pregnant',
  newborn: 'Newborn',
  child: 'Child',
};

const dbFollowStatusToApp: Record<'upcoming' | 'pending' | 'overdue' | 'done', FollowUp['status']> = {
  upcoming: 'Upcoming',
  pending: 'Pending',
  overdue: 'Overdue',
  done: 'Done',
};

export type RemoteWorkspaceSnapshot = {
  beneficiaries: Array<Beneficiary & { dbId: string }>;
  visits: VisitRecord[];
  followups: FollowUp[];
  referrals: Referral[];
  beneficiaryIdMap: Map<string, string>; // code (BEN-1001) -> UUID
};

export async function fetchWorkspaceFromSupabase(): Promise<RemoteWorkspaceSnapshot | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const [benRes, villageRes, visitRes, fieldsRes, histRes, fuRes, refRes] = await Promise.all([
    supabase.from('beneficiaries').select('*').order('code', { ascending: true }),
    supabase.from('villages').select('id, code'),
    supabase.from('visits').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('visit_fields').select('*').limit(500),
    supabase.from('visit_field_history').select('*').order('changed_at', { ascending: true }).limit(500),
    supabase.from('followups').select('*').order('due_date', { ascending: true }).limit(100),
    supabase.from('referrals').select('*').order('created_at', { ascending: false }).limit(100),
  ]);

  if (benRes.error) return null;

  const villageCodeById = new Map<string, string>((villageRes.data ?? []).map((v) => [v.id, v.code]));
  const beneficiaryIdMap = new Map<string, string>();
  const benByDbId = new Map<string, { code: string; name: string }>();

  const beneficiaries: Array<Beneficiary & { dbId: string }> = (benRes.data ?? []).map((row) => {
    beneficiaryIdMap.set(row.code, row.id);
    benByDbId.set(row.id, { code: row.code, name: row.name });
    return {
      dbId: row.id,
      id: row.code,
      name: row.name,
      kind: dbKindToApp[row.kind],
      age: row.age_label,
      due: row.due_label,
      villageId: villageCodeById.get(row.village_id) ?? 'village-pipal',
    };
  });

  const fieldsByVisit = new Map<string, VisitFields>();
  for (const f of fieldsRes.data ?? []) {
    const existing = fieldsByVisit.get(f.visit_id) ?? {
      beneficiaryId: '',
      visitType: 'General' as VisitType,
      weight: 'Not captured',
      vaccinationsDue: 'None reported',
      nextVisitDate: 'Not set',
    };
    if (f.field_name === 'visitType') existing.visitType = f.field_value as VisitType;
    else existing[f.field_name] = f.field_value;
    fieldsByVisit.set(f.visit_id, existing);
  }

  const historyByVisit = new Map<string, VisitRecord['corrections']>();
  for (const h of histRes.data ?? []) {
    const list = historyByVisit.get(h.visit_id) ?? [];
    list.push({
      field: h.field_name,
      oldValue: h.old_value,
      newValue: h.new_value,
      timestamp: h.changed_at,
    });
    historyByVisit.set(h.visit_id, list);
  }

  const visits: VisitRecord[] = (visitRes.data ?? []).map((v) => {
    const ben = benByDbId.get(v.beneficiary_id);
    const fields = fieldsByVisit.get(v.id) ?? {
      beneficiaryId: ben?.code ?? 'BEN-1001',
      visitType: v.visit_type,
      weight: 'Not captured',
      vaccinationsDue: 'None reported',
      nextVisitDate: 'Not set',
    };
    return {
      id: v.id,
      beneficiaryId: ben?.code ?? fields.beneficiaryId,
      beneficiaryName: ben?.name ?? ben?.code ?? 'Synthetic Beneficiary',
      fields,
      timestamp: v.created_at,
      transcript: '',
      dangerSign: v.flagged_danger,
      needsReview: v.needs_review,
      corrections: historyByVisit.get(v.id) ?? [],
      idempotencyKey: v.idempotency_key,
      duplicateOverrideReason: v.duplicate_override_reason ?? undefined,
    };
  });

  const followups: FollowUp[] = (fuRes.data ?? []).map((fu) => {
    const ben = benByDbId.get(fu.beneficiary_id);
    return {
      id: fu.id,
      beneficiaryId: ben?.code ?? 'BEN-1001',
      beneficiaryName: ben?.name ?? 'Synthetic Beneficiary',
      date: fu.due_date,
      status: dbFollowStatusToApp[fu.status] ?? followUpStatusForDate(fu.due_date),
      visitId: fu.visit_id ?? '',
    };
  });

  const referrals: Referral[] = (refRes.data ?? []).map((r) => {
    const ben = benByDbId.get(r.beneficiary_id);
    return {
      id: r.id,
      ruleId: r.rule_id,
      category: r.rule_id,
      timestamp: r.created_at,
      facility: r.facility_name,
      status: 'Pending review',
      transcriptExcerpt: r.transcript_excerpt,
      needsReview: r.needs_review,
      visitId: r.visit_id ?? undefined,
      beneficiaryId: ben?.code ?? 'BEN-1001',
      source: r.source,
    };
  });

  return { beneficiaries, visits, followups, referrals, beneficiaryIdMap };
}

export async function createReferralRemote(params: {
  beneficiaryDbId: string;
  ruleId: string;
  needsReview: boolean;
  source: 'asr' | 'manual';
  excerpt: string;
}): Promise<{ id: string } | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('create_referral', {
    p_beneficiary_id: params.beneficiaryDbId,
    p_rule_id: params.ruleId,
    p_needs_review: params.needsReview,
    p_source: params.source,
    p_excerpt: params.excerpt.slice(0, 240),
  });
  if (error || !data) return null;
  return { id: data.id };
}

export async function markFollowUpDoneRemote(followupId: string): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;
  // Only UUID rows exist remotely
  if (!/^[0-9a-f-]{36}$/i.test(followupId)) return false;
  const { error } = await supabase.from('followups').update({ status: 'done' }).eq('id', followupId);
  return !error;
}

/**
 * Real Supabase SyncTransport plugging cleanly into Phase 3's IndexedDB OfflineDraftQueue.
 * - Refreshes session token on reconnect without losing queued drafts
 * - Submits confirmed visits atomically through confirm_visit() RPC with idempotency_key
 * - Reports last-write-wins conflict notice if another visit of the same type was already saved
 */
export function createSupabaseSyncTransport(options: {
  resolveBeneficiaryDbId: (code: string) => string | undefined;
  onConflictResolved?: (visit: VisitRecord) => void;
  onSessionExpired?: () => void;
}): SyncTransport {
  return {
    name: 'SupabaseSyncTransport (RLS + confirm_visit RPC)',
    async submitVisit(draft: OfflineDraft) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { ok: false, error: 'Device is offline' };
      }
      const supabase = await getSupabase();
      if (!supabase) {
        return { ok: true, remoteId: `LOCAL-${draft.visit.id}` };
      }

      const token = await getActiveAccessToken();
      if (!token) {
        options.onSessionExpired?.();
        return { ok: false, error: 'Session expired. Draft is safe on this device — please sign in to sync.' };
      }

      const benDbId = options.resolveBeneficiaryDbId(draft.visit.beneficiaryId);
      if (!benDbId) {
        return { ok: false, error: `Beneficiary ${draft.visit.beneficiaryId} is not mapped in workspace.` };
      }

      const fieldEntries = [
        { field: 'beneficiaryId', value: draft.visit.fields.beneficiaryId, source: 'verified' },
        { field: 'visitType', value: draft.visit.fields.visitType, source: 'reported' },
        { field: 'weight', value: draft.visit.fields.weight, source: 'measured' },
        { field: 'vaccinationsDue', value: draft.visit.fields.vaccinationsDue, source: 'reported' },
        { field: 'nextVisitDate', value: draft.visit.fields.nextVisitDate, source: 'reported' },
      ];

      const historyEntries = draft.visit.corrections.map((c) => ({
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        changedAt: c.timestamp,
        changedVia: 'typed',
      }));

      const referralUuid = draft.visit.referralId && /^[0-9a-f-]{36}$/i.test(draft.visit.referralId)
        ? draft.visit.referralId
        : null;

      const { data, error } = await supabase.rpc('confirm_visit', {
        p_beneficiary_id: benDbId,
        p_idempotency_key: draft.idempotencyKey,
        p_visit_type: draft.visit.fields.visitType,
        p_confirmed: true,
        p_fields: fieldEntries,
        p_history: historyEntries,
        p_flagged_danger: draft.visit.dangerSign,
        p_needs_review: draft.visit.needsReview,
        p_duplicate_override_reason: draft.visit.duplicateOverrideReason ?? null,
        p_referral_id: referralUuid,
      });

      if (error) {
        if (/jwt|auth|401|expired/i.test(error.message)) {
          options.onSessionExpired?.();
        }
        return { ok: false, error: error.message };
      }

      const resObj = (data ?? {}) as { visit_id?: string; conflict_resolved?: boolean };
      if (resObj.conflict_resolved) {
        options.onConflictResolved?.(draft.visit);
      }

      return { ok: true, remoteId: resObj.visit_id || `SUPA-${draft.visit.id}` };
    },
  };
}
