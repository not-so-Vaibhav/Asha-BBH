-- Rollback script for Phase 4 migrations (used by migration up/down verification tests)

drop function if exists public.cleanup_expired_anonymous_users() cascade;
drop function if exists public.delete_my_account() cascade;
drop function if exists public.dashboard_csv_summary() cascade;
drop function if exists public.supervisor_area_summary() cascade;
drop function if exists public.seed_demo_workspace(text, text, uuid) cascade;
drop function if exists public.confirm_visit(uuid, text, public.visit_type, boolean, jsonb, jsonb, boolean, boolean, text, uuid) cascade;
drop function if exists public.create_referral(uuid, text, boolean, text, text, uuid) cascade;
drop function if exists public.write_audit_log() cascade;
drop function if exists public.enforce_worker_role_guard() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.current_worker_role() cascade;
drop function if exists public.current_worker_area_id() cascade;

drop table if exists public.audit_logs cascade;
drop table if exists public.referrals cascade;
drop table if exists public.followups cascade;
drop table if exists public.visit_field_history cascade;
drop table if exists public.visit_fields cascade;
drop table if exists public.visits cascade;
drop table if exists public.beneficiaries cascade;
drop table if exists public.households cascade;
drop table if exists public.workers cascade;
drop table if exists public.danger_sign_rules cascade;
drop table if exists public.health_facilities cascade;
drop table if exists public.villages cascade;
drop table if exists public.areas cascade;

drop type if exists public.referral_status;
drop type if exists public.followup_status;
drop type if exists public.change_via;
drop type if exists public.field_source;
drop type if exists public.visit_type;
drop type if exists public.visit_status;
drop type if exists public.beneficiary_kind;
drop type if exists public.worker_role;
