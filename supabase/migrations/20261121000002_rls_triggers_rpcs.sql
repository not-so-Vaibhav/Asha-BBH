-- ASHA SAKHI Phase 4 Row-Level Security, Audit Triggers, Security-Definer RPCs, and Anonymous Cleanup

-- ── Helper functions for RLS (SECURITY DEFINER with explicit search_path) ────
create or replace function public.current_worker_area_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select area_id from public.workers where id = auth.uid();
$$;

create or replace function public.current_worker_role()
returns public.worker_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.workers where id = auth.uid();
$$;

revoke all on function public.current_worker_area_id() from public;
grant execute on function public.current_worker_area_id() to authenticated;
revoke all on function public.current_worker_role() from public;
grant execute on function public.current_worker_role() to authenticated;

-- ── Updated-at trigger ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_workers_updated_at on public.workers;
create trigger trg_workers_updated_at before update on public.workers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_visits_updated_at on public.visits;
create trigger trg_visits_updated_at before update on public.visits
  for each row execute function public.set_updated_at();

drop trigger if exists trg_followups_updated_at on public.followups;
create trigger trg_followups_updated_at before update on public.followups
  for each row execute function public.set_updated_at();

drop trigger if exists trg_referrals_updated_at on public.referrals;
create trigger trg_referrals_updated_at before update on public.referrals
  for each row execute function public.set_updated_at();

-- ── Role lock trigger: self-sign-up is ALWAYS worker; users can NEVER change role
create or replace function public.enforce_worker_role_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  -- Only database superuser / service_role may assign or modify roles away from 'worker'
  if current_user in ('authenticated', 'anon') or jwt_role in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.role <> 'worker' then
      raise exception 'Self sign-up can only create role worker' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'Workers cannot change their own role' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workers_role_guard on public.workers;
create trigger trg_workers_role_guard
  before insert or update on public.workers
  for each row execute function public.enforce_worker_role_guard();

-- ── Audit Trigger on all write tables ────────────────────────────────────────
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_row_id text;
  v_req_id text;
  v_headers jsonb;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_req_id := coalesce(v_headers ->> 'x-request-id', v_headers ->> 'x-vercel-id', gen_random_uuid()::text);
  exception when others then
    v_req_id := gen_random_uuid()::text;
  end;

  if tg_op = 'DELETE' then
    v_row_id := coalesce((to_jsonb(old) ->> 'id'), 'unknown');
    insert into public.audit_logs (actor_id, table_name, row_id, action, before_data, after_data, request_id)
    values (v_actor, tg_table_name, v_row_id, tg_op, to_jsonb(old), null, v_req_id);
    return old;
  elsif tg_op = 'UPDATE' then
    v_row_id := coalesce((to_jsonb(new) ->> 'id'), 'unknown');
    insert into public.audit_logs (actor_id, table_name, row_id, action, before_data, after_data, request_id)
    values (v_actor, tg_table_name, v_row_id, tg_op, to_jsonb(old), to_jsonb(new), v_req_id);
    return new;
  else
    v_row_id := coalesce((to_jsonb(new) ->> 'id'), 'unknown');
    insert into public.audit_logs (actor_id, table_name, row_id, action, before_data, after_data, request_id)
    values (v_actor, tg_table_name, v_row_id, tg_op, null, to_jsonb(new), v_req_id);
    return new;
  end if;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['workers', 'households', 'beneficiaries', 'visits', 'visit_fields', 'visit_field_history', 'followups', 'referrals']
  loop
    execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
    execute format('create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t, t);
  end loop;
end $$;

-- ── Enable & Force Row-Level Security on EVERY table ─────────────────────────
alter table public.areas enable row level security;
alter table public.areas force row level security;

alter table public.villages enable row level security;
alter table public.villages force row level security;

alter table public.health_facilities enable row level security;
alter table public.health_facilities force row level security;

alter table public.danger_sign_rules enable row level security;
alter table public.danger_sign_rules force row level security;

alter table public.workers enable row level security;
alter table public.workers force row level security;

alter table public.households enable row level security;
alter table public.households force row level security;

alter table public.beneficiaries enable row level security;
alter table public.beneficiaries force row level security;

alter table public.visits enable row level security;
alter table public.visits force row level security;

alter table public.visit_fields enable row level security;
alter table public.visit_fields force row level security;

alter table public.visit_field_history enable row level security;
alter table public.visit_field_history force row level security;

alter table public.followups enable row level security;
alter table public.followups force row level security;

alter table public.referrals enable row level security;
alter table public.referrals force row level security;

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Revoke broad public privileges; grant only minimum needed to authenticated
revoke all on all tables in schema public from anon, authenticated, public;
grant usage on schema public to authenticated, anon;

grant select on public.areas, public.villages, public.health_facilities, public.danger_sign_rules to authenticated;
grant select, insert, update, delete on public.workers to authenticated;
grant select on public.households, public.beneficiaries to authenticated;
grant select, insert, update on public.visits, public.visit_fields, public.followups to authenticated;
grant select, insert on public.visit_field_history to authenticated;
grant select, update on public.referrals to authenticated;
grant select on public.audit_logs to authenticated;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

-- Reference tables: read-only to signed-in users
drop policy if exists areas_select_auth on public.areas;
create policy areas_select_auth on public.areas
  for select to authenticated using (true);

drop policy if exists villages_select_auth on public.villages;
create policy villages_select_auth on public.villages
  for select to authenticated using (true);

drop policy if exists health_facilities_select_auth on public.health_facilities;
create policy health_facilities_select_auth on public.health_facilities
  for select to authenticated using (true);

drop policy if exists danger_sign_rules_select_auth on public.danger_sign_rules;
create policy danger_sign_rules_select_auth on public.danger_sign_rules
  for select to authenticated using (true);

-- Workers: read/insert/update/delete ONLY own row, role locked to 'worker' for self-writes
drop policy if exists workers_select_own on public.workers;
create policy workers_select_own on public.workers
  for select to authenticated using (id = auth.uid());

drop policy if exists workers_insert_own on public.workers;
create policy workers_insert_own on public.workers
  for insert to authenticated with check (id = auth.uid() and role = 'worker');

drop policy if exists workers_update_own on public.workers;
create policy workers_update_own on public.workers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_worker_role());

drop policy if exists workers_delete_own on public.workers;
create policy workers_delete_own on public.workers
  for delete to authenticated using (id = auth.uid());

-- Households: workers read only their own scoped rows (or shared template rows in their area)
drop policy if exists households_select_worker on public.households;
create policy households_select_worker on public.households
  for select to authenticated
  using (
    public.current_worker_role() = 'worker'
    and area_id = public.current_worker_area_id()
    and (worker_id = auth.uid() or worker_id is null)
  );

-- Beneficiaries: read-only to assigned worker in their area (workers CANNOT create beneficiaries)
drop policy if exists beneficiaries_select_worker on public.beneficiaries;
create policy beneficiaries_select_worker on public.beneficiaries
  for select to authenticated
  using (
    public.current_worker_role() = 'worker'
    and area_id = public.current_worker_area_id()
    and (worker_id = auth.uid() or worker_id is null)
  );

-- Visits: strictly tied to worker_id AND area_id (supervisors NEVER read raw visits)
drop policy if exists visits_select_worker on public.visits;
create policy visits_select_worker on public.visits
  for select to authenticated
  using (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  );

drop policy if exists visits_insert_worker on public.visits;
create policy visits_insert_worker on public.visits
  for insert to authenticated
  with check (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  );

drop policy if exists visits_update_worker on public.visits;
create policy visits_update_worker on public.visits
  for update to authenticated
  using (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  )
  with check (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  );

-- Visit fields: tied to an owned visit
drop policy if exists visit_fields_select_worker on public.visit_fields;
create policy visit_fields_select_worker on public.visit_fields
  for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_fields.visit_id
        and v.worker_id = auth.uid()
        and v.area_id = public.current_worker_area_id()
        and public.current_worker_role() = 'worker'
    )
  );

drop policy if exists visit_fields_insert_worker on public.visit_fields;
create policy visit_fields_insert_worker on public.visit_fields
  for insert to authenticated
  with check (
    exists (
      select 1 from public.visits v
      where v.id = visit_fields.visit_id
        and v.worker_id = auth.uid()
        and v.area_id = public.current_worker_area_id()
        and public.current_worker_role() = 'worker'
    )
  );

drop policy if exists visit_fields_update_worker on public.visit_fields;
create policy visit_fields_update_worker on public.visit_fields
  for update to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_fields.visit_id
        and v.worker_id = auth.uid()
        and v.area_id = public.current_worker_area_id()
        and public.current_worker_role() = 'worker'
    )
  )
  with check (
    exists (
      select 1 from public.visits v
      where v.id = visit_fields.visit_id
        and v.worker_id = auth.uid()
        and v.area_id = public.current_worker_area_id()
        and public.current_worker_role() = 'worker'
    )
  );

-- Visit field history: append-only for visit owner
drop policy if exists visit_field_history_select_worker on public.visit_field_history;
create policy visit_field_history_select_worker on public.visit_field_history
  for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_field_history.visit_id
        and v.worker_id = auth.uid()
        and v.area_id = public.current_worker_area_id()
        and public.current_worker_role() = 'worker'
    )
  );

drop policy if exists visit_field_history_insert_worker on public.visit_field_history;
create policy visit_field_history_insert_worker on public.visit_field_history
  for insert to authenticated
  with check (
    exists (
      select 1 from public.visits v
      where v.id = visit_field_history.visit_id
        and v.worker_id = auth.uid()
        and v.area_id = public.current_worker_area_id()
        and public.current_worker_role() = 'worker'
    )
  );

-- Follow-ups: strictly tied to worker_id and area_id
drop policy if exists followups_select_worker on public.followups;
create policy followups_select_worker on public.followups
  for select to authenticated
  using (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  );

drop policy if exists followups_insert_worker on public.followups;
create policy followups_insert_worker on public.followups
  for insert to authenticated
  with check (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  );

drop policy if exists followups_update_worker on public.followups;
create policy followups_update_worker on public.followups
  for update to authenticated
  using (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  )
  with check (
    public.current_worker_role() = 'worker'
    and worker_id = auth.uid()
    and area_id = public.current_worker_area_id()
  );

-- Referrals: worker reads own rows; supervisor reads & reviews referrals in their area; inserts ONLY via create_referral RPC
drop policy if exists referrals_select_worker on public.referrals;
create policy referrals_select_worker on public.referrals
  for select to authenticated
  using (
    (public.current_worker_role() = 'worker' and worker_id = auth.uid() and area_id = public.current_worker_area_id())
    or
    (public.current_worker_role() = 'supervisor' and area_id = public.current_worker_area_id())
  );

drop policy if exists referrals_update_review on public.referrals;
create policy referrals_update_review on public.referrals
  for update to authenticated
  using (
    (public.current_worker_role() = 'worker' and worker_id = auth.uid() and area_id = public.current_worker_area_id())
    or
    (public.current_worker_role() = 'supervisor' and area_id = public.current_worker_area_id())
  )
  with check (
    (public.current_worker_role() = 'worker' and worker_id = auth.uid() and area_id = public.current_worker_area_id())
    or
    (public.current_worker_role() = 'supervisor' and area_id = public.current_worker_area_id())
  );

-- Audit logs: workers read ONLY their own entries; NO client insert/update/delete policies
drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own on public.audit_logs
  for select to authenticated
  using (actor_id = auth.uid());

-- ── Security-Definer RPCs ────────────────────────────────────────────────────

-- 1. create_referral: authoritative server-side referral creation (never trusts client rule version or applicability)
create or replace function public.create_referral(
  p_beneficiary_id uuid,
  p_rule_id text,
  p_needs_review boolean default false,
  p_source text default 'asr',
  p_excerpt text default '',
  p_visit_id uuid default null
)
returns public.referrals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_worker public.workers;
  v_ben public.beneficiaries;
  v_rule public.danger_sign_rules;
  v_facility public.health_facilities;
  v_excerpt text;
  v_result public.referrals;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_worker from public.workers where id = v_uid;
  if not found or v_worker.role <> 'worker' then
    raise exception 'Worker profile required' using errcode = '42501';
  end if;

  select * into v_ben
  from public.beneficiaries
  where id = p_beneficiary_id
    and area_id = v_worker.area_id
    and (worker_id = v_uid or worker_id is null);
  if not found then
    raise exception 'Beneficiary not accessible in your area' using errcode = '42501';
  end if;

  select * into v_rule
  from public.danger_sign_rules
  where id = p_rule_id and active = true;
  if not found then
    raise exception 'Unknown or inactive danger-sign rule: %', p_rule_id using errcode = '22023';
  end if;

  if not (v_ben.kind = any(v_rule.applies_to)) then
    raise exception 'Rule % does not apply to beneficiary kind %', p_rule_id, v_ben.kind using errcode = '22023';
  end if;

  if p_source not in ('asr', 'manual') then
    raise exception 'Invalid referral source' using errcode = '22023';
  end if;

  select * into v_facility
  from public.health_facilities
  where area_id = v_worker.area_id
  order by created_at asc
  limit 1;

  v_excerpt := left(coalesce(trim(p_excerpt), ''), 240);

  insert into public.referrals (
    beneficiary_id,
    visit_id,
    worker_id,
    area_id,
    rule_id,
    rule_version,
    facility_id,
    facility_name,
    needs_review,
    status,
    source,
    transcript_excerpt,
    synthetic
  )
  values (
    v_ben.id,
    p_visit_id,
    v_uid,
    v_worker.area_id,
    v_rule.id,
    v_rule.version,
    v_facility.id,
    coalesce(v_facility.name, 'Sample PHC North'),
    coalesce(p_needs_review, false),
    'pending',
    p_source,
    v_excerpt,
    true
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_referral(uuid, text, boolean, text, text, uuid) from public;
grant execute on function public.create_referral(uuid, text, boolean, text, text, uuid) to authenticated;

-- 2. confirm_visit: validates confirmation, idempotent by idempotency_key, writes visit_fields + history + followup
create or replace function public.confirm_visit(
  p_beneficiary_id uuid,
  p_idempotency_key text,
  p_visit_type public.visit_type,
  p_confirmed boolean,
  p_fields jsonb,
  p_history jsonb default '[]'::jsonb,
  p_flagged_danger boolean default false,
  p_needs_review boolean default false,
  p_duplicate_override_reason text default null,
  p_referral_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_worker public.workers;
  v_ben public.beneficiaries;
  v_existing public.visits;
  v_visit public.visits;
  v_field_item jsonb;
  v_hist_item jsonb;
  v_next_date_text text;
  v_next_date date;
  v_followup_status public.followup_status;
  v_followup public.followups;
  v_conflict boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_confirmed is not true then
    raise exception 'Visit cannot be saved before explicit worker confirmation' using errcode = '22023';
  end if;

  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 6 then
    raise exception 'Valid idempotency_key is required' using errcode = '22023';
  end if;

  select * into v_worker from public.workers where id = v_uid;
  if not found or v_worker.role <> 'worker' then
    raise exception 'Worker profile required' using errcode = '42501';
  end if;

  select * into v_ben
  from public.beneficiaries
  where id = p_beneficiary_id
    and area_id = v_worker.area_id
    and (worker_id = v_uid or worker_id is null);
  if not found then
    raise exception 'Beneficiary not accessible in your area' using errcode = '42501';
  end if;

  -- Idempotency check
  select * into v_existing
  from public.visits
  where idempotency_key = trim(p_idempotency_key);

  if found then
    if v_existing.worker_id <> v_uid then
      raise exception 'Idempotency key belongs to another worker' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'visit_id', v_existing.id,
      'idempotency_key', v_existing.idempotency_key,
      'status', v_existing.status,
      'idempotent_replay', true,
      'conflict_resolved', false
    );
  end if;

  -- Check if another visit of same type exists for same beneficiary today without override reason (last-write-wins note)
  if exists (
    select 1 from public.visits
    where beneficiary_id = v_ben.id
      and worker_id = v_uid
      and visit_type = p_visit_type
      and (created_at at time zone 'utc')::date = (timezone('utc', now()))::date
  ) then
    v_conflict := true;
  end if;

  insert into public.visits (
    beneficiary_id,
    worker_id,
    area_id,
    idempotency_key,
    status,
    visit_type,
    flagged_danger,
    needs_review,
    duplicate_override_reason,
    confirmed_at,
    synthetic
  )
  values (
    v_ben.id,
    v_uid,
    v_worker.area_id,
    trim(p_idempotency_key),
    'saved',
    p_visit_type,
    coalesce(p_flagged_danger, false),
    coalesce(p_needs_review, false),
    nullif(trim(coalesce(p_duplicate_override_reason, '')), ''),
    timezone('utc', now()),
    true
  )
  returning * into v_visit;

  -- Write structured fields
  if jsonb_typeof(p_fields) = 'array' then
    for v_field_item in select * from jsonb_array_elements(p_fields)
    loop
      insert into public.visit_fields (visit_id, field_name, field_value, source, confidence, synthetic)
      values (
        v_visit.id,
        v_field_item ->> 'field',
        coalesce(v_field_item ->> 'value', ''),
        coalesce((v_field_item ->> 'source')::public.field_source, 'reported'),
        case when v_field_item ? 'confidence' and v_field_item ->> 'confidence' is not null
             then (v_field_item ->> 'confidence')::numeric(4,3)
             else null end,
        true
      )
      on conflict (visit_id, field_name)
      do update set
        field_value = excluded.field_value,
        source = excluded.source,
        confidence = excluded.confidence,
        updated_at = timezone('utc', now());

      if (v_field_item ->> 'field') = 'nextVisitDate' then
        v_next_date_text := v_field_item ->> 'value';
      end if;
    end loop;
  end if;

  -- Write correction history
  if jsonb_typeof(p_history) = 'array' then
    for v_hist_item in select * from jsonb_array_elements(p_history)
    loop
      insert into public.visit_field_history (visit_id, field_name, old_value, new_value, changed_at, changed_via, changed_by, synthetic)
      values (
        v_visit.id,
        v_hist_item ->> 'field',
        coalesce(v_hist_item ->> 'oldValue', ''),
        coalesce(v_hist_item ->> 'newValue', ''),
        coalesce((v_hist_item ->> 'changedAt')::timestamptz, timezone('utc', now())),
        coalesce((v_hist_item ->> 'changedVia')::public.change_via, 'typed'),
        v_uid,
        true
      );
    end loop;
  end if;

  -- Link referral if supplied and owned by caller
  if p_referral_id is not null then
    update public.referrals
    set visit_id = v_visit.id
    where id = p_referral_id
      and worker_id = v_uid
      and area_id = v_worker.area_id;
  end if;

  -- Create follow-up when nextVisitDate is a valid ISO YYYY-MM-DD date
  if v_next_date_text ~ '^\d{4}-\d{2}-\d{2}$' then
    v_next_date := v_next_date_text::date;
    if v_next_date < (timezone('utc', now()))::date then
      v_followup_status := 'overdue';
    elsif v_next_date = (timezone('utc', now()))::date then
      v_followup_status := 'pending';
    else
      v_followup_status := 'upcoming';
    end if;

    insert into public.followups (beneficiary_id, visit_id, worker_id, area_id, due_date, status, synthetic)
    values (v_ben.id, v_visit.id, v_uid, v_worker.area_id, v_next_date, v_followup_status, true)
    returning * into v_followup;
  end if;

  return jsonb_build_object(
    'visit_id', v_visit.id,
    'followup_id', v_followup.id,
    'idempotency_key', v_visit.idempotency_key,
    'status', v_visit.status,
    'idempotent_replay', false,
    'conflict_resolved', v_conflict
  );
end;
$$;

revoke all on function public.confirm_visit(uuid, text, public.visit_type, boolean, jsonb, jsonb, boolean, boolean, text, uuid) from public;
grant execute on function public.confirm_visit(uuid, text, public.visit_type, boolean, jsonb, jsonb, boolean, boolean, text, uuid) to authenticated;

-- 3. seed_demo_workspace: isolates five synthetic beneficiaries + households for an anonymous or newly onboarded worker
create or replace function public.seed_demo_workspace(
  p_display_name text default 'Demo ASHA Worker',
  p_language text default 'en',
  p_area_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_area public.areas;
  v_v1 uuid;
  v_v2 uuid;
  v_v3 uuid;
  v_hh1 uuid;
  v_hh2 uuid;
  v_hh3 uuid;
  v_hh4 uuid;
  v_hh5 uuid;
  v_ben_count int;
  v_lang text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_lang := case when p_language in ('en', 'hi', 'mr') then p_language else 'en' end;

  if p_area_id is not null then
    select * into v_area from public.areas where id = p_area_id;
  end if;
  if v_area.id is null then
    select * into v_area from public.areas where code = 'AREA-DEMO-A' limit 1;
  end if;
  if v_area.id is null then
    select * into v_area from public.areas order by created_at asc limit 1;
  end if;
  if v_area.id is null then
    raise exception 'Sample areas are not seeded yet' using errcode = 'P0002';
  end if;

  -- Upsert worker profile (ALWAYS role = 'worker')
  insert into public.workers (id, display_name, area_id, language, role, is_demo)
  values (v_uid, coalesce(nullif(trim(p_display_name), ''), 'Demo ASHA Worker'), v_area.id, v_lang, 'worker', true)
  on conflict (id) do update set
    display_name = coalesce(nullif(trim(p_display_name), ''), public.workers.display_name),
    language = v_lang,
    area_id = coalesce(p_area_id, public.workers.area_id);

  -- Resolve sample villages (fallback to first village in area if area has fewer than 3)
  select id into v_v1 from public.villages where code = 'village-pipal' limit 1;
  select id into v_v2 from public.villages where code = 'village-lotus' limit 1;
  select id into v_v3 from public.villages where code = 'village-river' limit 1;
  if v_v1 is null then select id into v_v1 from public.villages where area_id = v_area.id limit 1; end if;
  v_v2 := coalesce(v_v2, v_v1);
  v_v3 := coalesce(v_v3, v_v1);

  -- Idempotently clone the 5 synthetic households & beneficiaries scoped strictly to worker_id = v_uid
  select count(*) into v_ben_count from public.beneficiaries where worker_id = v_uid;
  if v_ben_count = 0 then
    insert into public.households (code, area_id, village_id, worker_id, label, lat, lng, synthetic)
    values ('HH-01', v_area.id, v_v1, v_uid, 'Sunita household', 21.151, 79.078, true)
    on conflict (worker_id, code) do update set label = excluded.label returning id into v_hh1;

    insert into public.households (code, area_id, village_id, worker_id, label, lat, lng, synthetic)
    values ('HH-02', v_area.id, v_v1, v_uid, 'Anita household', 21.153, 79.086, true)
    on conflict (worker_id, code) do update set label = excluded.label returning id into v_hh2;

    insert into public.households (code, area_id, village_id, worker_id, label, lat, lng, synthetic)
    values ('HH-03', v_area.id, v_v2, v_uid, 'Rekha household', 21.164, 79.096, true)
    on conflict (worker_id, code) do update set label = excluded.label returning id into v_hh3;

    insert into public.households (code, area_id, village_id, worker_id, label, lat, lng, synthetic)
    values ('HH-05', v_area.id, v_v3, v_uid, 'Meena household', 21.138, 79.104, true)
    on conflict (worker_id, code) do update set label = excluded.label returning id into v_hh5;

    insert into public.households (code, area_id, village_id, worker_id, label, lat, lng, synthetic)
    values ('HH-04', v_area.id, v_v2, v_uid, 'Aarav household', 21.168, 79.093, true)
    on conflict (worker_id, code) do update set label = excluded.label returning id into v_hh4;

    insert into public.beneficiaries (code, area_id, village_id, household_id, worker_id, name, kind, age_label, due_label, synthetic)
    values
      ('BEN-1001', v_area.id, v_v1, v_hh1, v_uid, 'Sunita Patil', 'pregnant', '28 yrs', 'ANC follow-up', true),
      ('BEN-1002', v_area.id, v_v1, v_hh2, v_uid, 'Baby of Anita', 'newborn', 'Day 7', 'Newborn check', true),
      ('BEN-1003', v_area.id, v_v2, v_hh3, v_uid, 'Rekha Jadhav', 'child', '9 months', 'Growth check', true),
      ('BEN-1004', v_area.id, v_v3, v_hh5, v_uid, 'Meena Pawar', 'pregnant', '24 yrs', 'ANC visit', true),
      ('BEN-1005', v_area.id, v_v2, v_hh4, v_uid, 'Aarav Kulkarni', 'child', '2 yrs', 'Immunisation', true)
    on conflict (worker_id, code) do nothing;
  end if;

  select count(*) into v_ben_count from public.beneficiaries where worker_id = v_uid;

  return jsonb_build_object(
    'worker_id', v_uid,
    'area_id', v_area.id,
    'beneficiaries_seeded', v_ben_count
  );
end;
$$;

revoke all on function public.seed_demo_workspace(text, text, uuid) from public;
grant execute on function public.seed_demo_workspace(text, text, uuid) to authenticated;

-- 4. supervisor_area_summary: aggregated counts ONLY for supervisors (never raw transcripts or fields)
create or replace function public.supervisor_area_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_worker public.workers;
  v_total_visits int;
  v_danger_visits int;
  v_pending_referrals int;
  v_reviewed_referrals int;
  v_upcoming_followups int;
  v_overdue_followups int;
  v_done_followups int;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_worker from public.workers where id = v_uid;
  if not found or v_worker.role <> 'supervisor' then
    raise exception 'Supervisor role required' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where flagged_danger)
    into v_total_visits, v_danger_visits
    from public.visits where area_id = v_worker.area_id;

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'reviewed')
    into v_pending_referrals, v_reviewed_referrals
    from public.referrals where area_id = v_worker.area_id;

  select
    count(*) filter (where status = 'upcoming'),
    count(*) filter (where status = 'overdue'),
    count(*) filter (where status = 'done')
    into v_upcoming_followups, v_overdue_followups, v_done_followups
    from public.followups where area_id = v_worker.area_id;

  return jsonb_build_object(
    'area_id', v_worker.area_id,
    'total_visits', v_total_visits,
    'danger_visits', v_danger_visits,
    'pending_referrals', v_pending_referrals,
    'reviewed_referrals', v_reviewed_referrals,
    'upcoming_followups', v_upcoming_followups,
    'overdue_followups', v_overdue_followups,
    'done_followups', v_done_followups
  );
end;
$$;

revoke all on function public.supervisor_area_summary() from public;
grant execute on function public.supervisor_area_summary() to authenticated;

-- 5. dashboard_csv_summary: scoped CSV payload for worker (or counts-only for supervisor)
create or replace function public.dashboard_csv_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_worker public.workers;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_worker from public.workers where id = v_uid;
  if not found then
    raise exception 'Worker profile required' using errcode = '42501';
  end if;

  if v_worker.role = 'supervisor' then
    return jsonb_build_object(
      'mode', 'supervisor_aggregates',
      'summary', public.supervisor_area_summary()
    );
  end if;

  return jsonb_build_object(
    'mode', 'worker_records',
    'visits_count', (select count(*) from public.visits where worker_id = v_uid and area_id = v_worker.area_id),
    'followups_count', (select count(*) from public.followups where worker_id = v_uid and area_id = v_worker.area_id),
    'referrals_count', (select count(*) from public.referrals where worker_id = v_uid and area_id = v_worker.area_id)
  );
end;
$$;

revoke all on function public.dashboard_csv_summary() from public;
grant execute on function public.dashboard_csv_summary() to authenticated;

-- 6. delete_my_account: deletes worker profile, cascades scoped rows, and removes auth.users record
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.workers where id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object('deleted', true, 'user_id', v_uid);
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- 7. cleanup_expired_anonymous_users: deletes anonymous demo users older than 7 days (cascades all scoped rows)
create or replace function public.cleanup_expired_anonymous_users()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  delete from auth.users
  where coalesce(is_anonymous, false) = true
    and created_at < timezone('utc', now()) - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_anonymous_users() from public;

-- Schedule daily cleanup via pg_cron if extension is available (Supabase hosted & local with pg_cron)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'asha-sakhi-cleanup-anon-users',
      '0 3 * * *',
      'select public.cleanup_expired_anonymous_users();'
    );
  end if;
exception when others then
  -- pg_cron may not be active in non-Supabase local test clusters
  null;
end $$;
