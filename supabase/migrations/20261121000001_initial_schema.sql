-- ASHA SAKHI Phase 4 Initial Schema
-- All timestamps are UTC (timestamptz). Patient-like tables carry `synthetic boolean not null default true`.
-- No raw audio is ever stored. Only bounded referral excerpts (<= 280 chars) are stored on referrals.

create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.worker_role as enum ('worker', 'supervisor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.beneficiary_kind as enum ('pregnant', 'newborn', 'child');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_status as enum ('draft', 'saved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_type as enum ('ANC', 'PNC', 'HBNC', 'HBYC', 'Immunisation', 'General');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.field_source as enum ('reported', 'observed', 'measured', 'verified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.change_via as enum ('voice', 'typed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.followup_status as enum ('upcoming', 'pending', 'overdue', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.referral_status as enum ('pending', 'reviewed', 'closed');
exception when duplicate_object then null; end $$;

-- ── Reference Geography & Sample Master Tables ───────────────────────────────
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  district text not null,
  block text not null,
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.villages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  area_id uuid not null references public.areas(id) on delete cascade,
  name text not null,
  block text not null,
  district text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  boundary_json jsonb not null default '[]'::jsonb,
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_villages_area_id on public.villages(area_id);

create table if not exists public.health_facilities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  area_id uuid not null references public.areas(id) on delete cascade,
  name text not null,
  sample_label text not null default 'Sample facility',
  lat double precision not null,
  lng double precision not null,
  distance_label text not null default '1.8 km',
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_health_facilities_area_id on public.health_facilities(area_id);

create table if not exists public.danger_sign_rules (
  id text primary key,
  version text not null,
  category text not null,
  applies_to public.beneficiary_kind[] not null,
  source_citation text not null,
  wording_en text not null,
  wording_hi text not null,
  wording_mr text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

-- ── Workers (1:1 with auth.users) ────────────────────────────────────────────
create table if not exists public.workers (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  asha_id_demo text not null default ('ASHA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  area_id uuid not null references public.areas(id),
  language text not null default 'en' check (language in ('en', 'hi', 'mr')),
  role public.worker_role not null default 'worker',
  is_demo boolean not null default false,
  consent_accepted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_workers_area_id on public.workers(area_id);
create index if not exists idx_workers_role on public.workers(role);

-- ── Patient-like Synthetic Tables (strictly scoped by worker_id & area_id) ───
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  area_id uuid not null references public.areas(id) on delete cascade,
  village_id uuid not null references public.villages(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete cascade,
  label text not null,
  lat double precision not null,
  lng double precision not null,
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (worker_id, code)
);
create index if not exists idx_households_area_worker on public.households(area_id, worker_id);

create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  area_id uuid not null references public.areas(id) on delete cascade,
  village_id uuid not null references public.villages(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  worker_id uuid references public.workers(id) on delete cascade,
  name text not null,
  kind public.beneficiary_kind not null,
  age_label text not null,
  due_label text not null,
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (worker_id, code)
);
create index if not exists idx_beneficiaries_area_worker on public.beneficiaries(area_id, worker_id);
create index if not exists idx_beneficiaries_village on public.beneficiaries(village_id);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  idempotency_key text not null unique,
  status public.visit_status not null default 'draft',
  visit_type public.visit_type not null default 'General',
  flagged_danger boolean not null default false,
  needs_review boolean not null default false,
  duplicate_override_reason text,
  confirmed_at timestamptz,
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_visits_worker_area on public.visits(worker_id, area_id, created_at desc);
create index if not exists idx_visits_beneficiary on public.visits(beneficiary_id, created_at desc);

create table if not exists public.visit_fields (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  field_name text not null check (field_name in ('beneficiaryId', 'visitType', 'weight', 'vaccinationsDue', 'nextVisitDate')),
  field_value text not null,
  source public.field_source not null default 'reported',
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  synthetic boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (visit_id, field_name)
);
create index if not exists idx_visit_fields_visit_id on public.visit_fields(visit_id);

create table if not exists public.visit_field_history (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  field_name text not null check (field_name in ('beneficiaryId', 'visitType', 'weight', 'vaccinationsDue', 'nextVisitDate')),
  old_value text not null,
  new_value text not null,
  changed_at timestamptz not null default timezone('utc', now()),
  changed_via public.change_via not null default 'typed',
  changed_by uuid references public.workers(id) on delete set null,
  synthetic boolean not null default true
);
create index if not exists idx_visit_field_history_visit_id on public.visit_field_history(visit_id, changed_at asc);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  worker_id uuid not null references public.workers(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  due_date date not null,
  status public.followup_status not null default 'upcoming',
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_followups_worker_due on public.followups(worker_id, due_date asc);
create index if not exists idx_followups_area_status on public.followups(area_id, status);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  worker_id uuid not null references public.workers(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  rule_id text not null references public.danger_sign_rules(id),
  rule_version text not null,
  facility_id uuid references public.health_facilities(id) on delete set null,
  facility_name text not null,
  needs_review boolean not null default false,
  status public.referral_status not null default 'pending',
  source text not null default 'asr' check (source in ('asr', 'manual')),
  transcript_excerpt text not null check (char_length(transcript_excerpt) <= 280),
  synthetic boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_referrals_area_status on public.referrals(area_id, status, created_at desc);
create index if not exists idx_referrals_worker on public.referrals(worker_id, created_at desc);

-- ── Immutable Audit Log (insert only via database triggers) ──────────────────
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before_data jsonb,
  after_data jsonb,
  request_id text,
  occurred_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_audit_logs_actor_time on public.audit_logs(actor_id, occurred_at desc);
create index if not exists idx_audit_logs_table_row on public.audit_logs(table_name, row_id);
