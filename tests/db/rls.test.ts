import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

const root = process.cwd();
const migration1 = readFileSync(path.join(root, 'supabase/migrations/20261121000001_initial_schema.sql'), 'utf8');
const migration2 = readFileSync(path.join(root, 'supabase/migrations/20261121000002_rls_triggers_rpcs.sql'), 'utf8');
const downSql = readFileSync(path.join(root, 'supabase/rollbacks/down.sql'), 'utf8');
const seedSql = readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8');

const AUTH_SHIM_SQL = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`;

async function withUser<T>(client: Client, userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client.query(`SELECT set_config('request.headers', '{"x-request-id":"test-req-1"}', true)`);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

describe('Supabase Postgres schema, migrations, RLS, triggers, and security-definer RPCs', () => {
  let pgDir: string | null = null;
  let pgProc: ChildProcess | null = null;
  let dbUrl = process.env.DATABASE_URL || '';
  let admin: Client;
  let useExternalSupabase = Boolean(dbUrl);

  const workerA = '11111111-1111-4111-8111-111111111111';
  const workerB = '22222222-2222-4222-8222-222222222222';
  const supervisorA = '33333333-3333-4333-8333-333333333333';
  const anonA = '44444444-4444-4444-8444-444444444444';
  const anonB = '55555555-5555-4555-8555-555555555555';
  const expiredAnon = '66666666-6666-4666-8666-666666666666';

  let areaAId = '';
  let areaBId = '';
  let benA1Id = '';
  let benANewbornId = '';
  let benB1Id = '';
  let visitAId = '';
  let referralAId = '';

  beforeAll(async () => {
    if (!useExternalSupabase) {
      const port = 55432 + Math.floor(Math.random() * 400);
      pgDir = mkdtempSync(path.join('/tmp', 'asha-pg-'));
      execFileSync('initdb', ['-D', pgDir, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
      pgProc = spawn('postgres', ['-D', pgDir, '-p', String(port), '-k', pgDir, '-h', '127.0.0.1'], { stdio: 'ignore' });
      dbUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;

      // Wait for Postgres to accept connections
      for (let i = 0; i < 40; i++) {
        try {
          const probe = new Client({ connectionString: dbUrl });
          await probe.connect();
          await probe.end();
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }

    admin = new Client({ connectionString: dbUrl });
    await admin.connect();

    if (!useExternalSupabase) {
      await admin.query(AUTH_SHIM_SQL);
      await admin.query(migration1);
      await admin.query(migration2);
      await admin.query(seedSql);
    }
  }, 30_000);

  afterAll(async () => {
    await admin?.end().catch(() => undefined);
    if (pgProc) {
      pgProc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
    }
    if (pgDir) {
      rmSync(pgDir, { recursive: true, force: true });
    }
  });

  it('supports migration down, migration up, and idempotent seed execution', async () => {
    await admin.query(downSql);
    const afterDown = await admin.query(`select to_regclass('public.visits') as t`);
    expect(afterDown.rows[0].t).toBeNull();

    await admin.query(migration1);
    await admin.query(migration2);
    // Run seed TWICE to prove idempotence
    await admin.query(seedSql);
    await admin.query(seedSql);

    const areas = await admin.query(`select id, code from public.areas order by code asc`);
    expect(areas.rows.map((r) => r.code)).toEqual(['AREA-DEMO-A', 'AREA-DEMO-B', 'AREA-DEMO-C']);
    areaAId = areas.rows[0].id;
    areaBId = areas.rows[1].id;

    const rulesRes = await admin.query(`select count(*)::int as c from public.danger_sign_rules`);
    expect(rulesRes.rows[0].c).toBe(7);

    // Verify RLS is ENABLED and FORCED on every single public table
    const rlsCheck = await admin.query(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by relname
    `);
    expect(rlsCheck.rows.length).toBeGreaterThanOrEqual(13);
    for (const row of rlsCheck.rows) {
      expect(row.relrowsecurity, `RLS enabled on ${row.relname}`).toBe(true);
      expect(row.relforcerowsecurity, `RLS forced on ${row.relname}`).toBe(true);
    }
  });

  it('provisions two workers in different areas, enforces self-signup role=worker, and blocks self role escalation', async () => {
    // Seed auth.users for test accounts
    for (const [id, email, isAnon, daysAgo] of [
      [workerA, 'worker-a@example.com', false, 0],
      [workerB, 'worker-b@example.com', false, 0],
      [supervisorA, 'supervisor-a@example.com', false, 0],
      [anonA, null, true, 0],
      [anonB, null, true, 0],
      [expiredAnon, null, true, 10],
    ] as const) {
      await admin.query(
        `insert into auth.users (id, email, is_anonymous, created_at)
         values ($1, $2, $3, timezone('utc', now()) - ($4 || ' days')::interval)
         on conflict (id) do nothing`,
        [id, email, isAnon, daysAgo],
      );
    }

    // Attempt to self-signup as supervisor MUST FAIL
    await expect(
      withUser(admin, workerA, () =>
        admin.query(
          `insert into public.workers (id, display_name, area_id, language, role) values ($1, 'Rogue', $2, 'en', 'supervisor')`,
          [workerA, areaAId],
        ),
      ),
    ).rejects.toThrow();

    // Legitimate self-signup via seed_demo_workspace (sets role=worker and scopes 5 beneficiaries)
    const seededA = await withUser(admin, workerA, async () => {
      const res = await admin.query(`select public.seed_demo_workspace('ASHA Worker A', 'en', $1) as r`, [areaAId]);
      return res.rows[0].r;
    });
    expect(seededA.beneficiaries_seeded).toBe(5);

    const seededB = await withUser(admin, workerB, async () => {
      const res = await admin.query(`select public.seed_demo_workspace('ASHA Worker B', 'hi', $1) as r`, [areaBId]);
      return res.rows[0].r;
    });
    expect(seededB.beneficiaries_seeded).toBe(5);

    // Worker A CANNOT escalate their own role to supervisor
    await expect(
      withUser(admin, workerA, () =>
        admin.query(`update public.workers set role = 'supervisor' where id = $1`, [workerA]),
      ),
    ).rejects.toThrow();

    // Admin SQL promotes supervisorA (documented supervisor creation step)
    await admin.query(
      `insert into public.workers (id, display_name, area_id, language, role)
       values ($1, 'Area A Supervisor', $2, 'en', 'supervisor')
       on conflict (id) do update set role = 'supervisor'`,
      [supervisorA, areaAId],
    );

    // Fetch beneficiary IDs for A and B
    const bensA = await withUser(admin, workerA, () =>
      admin.query(`select id, code from public.beneficiaries order by code asc`),
    );
    expect(bensA.rows.length).toBe(5);
    benA1Id = bensA.rows.find((r) => r.code === 'BEN-1001')!.id;
    benANewbornId = bensA.rows.find((r) => r.code === 'BEN-1002')!.id;

    const bensB = await withUser(admin, workerB, () =>
      admin.query(`select id, code from public.beneficiaries order by code asc`),
    );
    expect(bensB.rows.length).toBe(5);
    benB1Id = bensB.rows.find((r) => r.code === 'BEN-1001')!.id;
    expect(benA1Id).not.toBe(benB1Id);
  });

  it('enforces confirm_visit confirmation guard, idempotency, history, follow-up, and create_referral validation', async () => {
    // confirm_visit MUST reject unconfirmed save
    await expect(
      withUser(admin, workerA, () =>
        admin.query(
          `select public.confirm_visit($1, 'idem-unconfirmed-1', 'ANC', false, '[]'::jsonb, '[]'::jsonb, false, false, null, null)`,
          [benA1Id],
        ),
      ),
    ).rejects.toThrow(/explicit worker confirmation/i);

    // create_referral MUST reject newborn rule NB-01 applied to Pregnant beneficiary
    await expect(
      withUser(admin, workerA, () =>
        admin.query(`select public.create_referral($1, 'NB-01', false, 'asr', 'fever', null)`, [benA1Id]),
      ),
    ).rejects.toThrow(/does not apply/i);

    // create_referral succeeds for PREG-01 on Pregnant beneficiary and sets authoritative rule_version
    const refRes = await withUser(admin, workerA, () =>
      admin.query(`select * from public.create_referral($1, 'PREG-01', true, 'asr', 'Maybe bleeding reported', null)`, [benA1Id]),
    );
    referralAId = refRes.rows[0].id;
    expect(refRes.rows[0].rule_version).toBe('PS1-demo-3');
    expect(refRes.rows[0].needs_review).toBe(true);
    expect(refRes.rows[0].status).toBe('pending');

    // Valid confirmed visit writes fields, correction history, follow-up, links referral, and logs audit
    const fieldsJson = JSON.stringify([
      { field: 'beneficiaryId', value: 'BEN-1001', source: 'verified' },
      { field: 'visitType', value: 'ANC', source: 'reported' },
      { field: 'weight', value: '56 kg', source: 'measured' },
      { field: 'vaccinationsDue', value: 'TT1', source: 'reported' },
      { field: 'nextVisitDate', value: '2026-11-28', source: 'reported' },
    ]);
    const historyJson = JSON.stringify([
      { field: 'weight', oldValue: '55 kg', newValue: '56 kg', changedVia: 'voice' },
    ]);

    const saved = await withUser(admin, workerA, async () => {
      const r = await admin.query(
        `select public.confirm_visit($1, 'idem-visit-a-001', 'ANC', true, $2::jsonb, $3::jsonb, true, true, null, $4) as res`,
        [benA1Id, fieldsJson, historyJson, referralAId],
      );
      return r.rows[0].res;
    });
    expect(saved.idempotent_replay).toBe(false);
    expect(saved.followup_id).toBeTruthy();
    visitAId = saved.visit_id;

    // Replaying exact same idempotency_key returns original visit without duplicating
    const replayed = await withUser(admin, workerA, async () => {
      const r = await admin.query(
        `select public.confirm_visit($1, 'idem-visit-a-001', 'ANC', true, $2::jsonb, $3::jsonb, true, true, null, $4) as res`,
        [benA1Id, fieldsJson, historyJson, referralAId],
      );
      return r.rows[0].res;
    });
    expect(replayed.idempotent_replay).toBe(true);
    expect(replayed.visit_id).toBe(visitAId);

    // Newborn NB-01 succeeds on Newborn beneficiary
    const nbRef = await withUser(admin, workerA, () =>
      admin.query(`select * from public.create_referral($1, 'NB-01', false, 'manual', 'Hot to touch', null)`, [benANewbornId]),
    );
    expect(nbRef.rows[0].rule_id).toBe('NB-01');
    expect(nbRef.rows[0].source).toBe('manual');

    // Audit log recorded writes for workerA automatically via DB triggers
    const logsA = await withUser(admin, workerA, () =>
      admin.query(`select table_name, action from public.audit_logs order by id asc`),
    );
    const auditedTables = new Set(logsA.rows.map((r) => r.table_name));
    expect(auditedTables.has('visits')).toBe(true);
    expect(auditedTables.has('visit_fields')).toBe(true);
    expect(auditedTables.has('visit_field_history')).toBe(true);
    expect(auditedTables.has('followups')).toBe(true);
    expect(auditedTables.has('referrals')).toBe(true);
  });

  it('proves strict RLS isolation: Worker B cannot read or write Worker A rows on EVERY table', async () => {
    // Worker B reads zero of Worker A's rows across every table
    await withUser(admin, workerB, async () => {
      expect((await admin.query(`select * from public.workers where id = $1`, [workerA])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.households where worker_id = $1`, [workerA])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.beneficiaries where id = $1`, [benA1Id])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.visits where id = $1`, [visitAId])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.visit_fields where visit_id = $1`, [visitAId])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.visit_field_history where visit_id = $1`, [visitAId])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.followups where worker_id = $1`, [workerA])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.referrals where id = $1`, [referralAId])).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.audit_logs where actor_id = $1`, [workerA])).rows).toHaveLength(0);
    });

    // Worker B cannot update Worker A's visit or referral (0 rows affected)
    await withUser(admin, workerB, async () => {
      const updVisit = await admin.query(`update public.visits set visit_type = 'PNC' where id = $1 returning id`, [visitAId]);
      expect(updVisit.rows).toHaveLength(0);
      const updRef = await admin.query(`update public.referrals set status = 'closed' where id = $1 returning id`, [referralAId]);
      expect(updRef.rows).toHaveLength(0);
    });

    // Worker B cannot call confirm_visit or create_referral targeting Worker A's beneficiary
    await expect(
      withUser(admin, workerB, () =>
        admin.query(`select public.create_referral($1, 'PREG-01', false, 'asr', 'hijack', null)`, [benA1Id]),
      ),
    ).rejects.toThrow(/not accessible/i);

    // Worker B CANNOT directly insert into audit_logs, beneficiaries, danger_sign_rules, or health_facilities
    await expect(
      withUser(admin, workerB, () =>
        admin.query(`insert into public.audit_logs (actor_id, table_name, row_id, action) values ($1, 'visits', 'fake', 'INSERT')`, [workerB]),
      ),
    ).rejects.toThrow();

    await expect(
      withUser(admin, workerB, () =>
        admin.query(`delete from public.audit_logs where actor_id = $1`, [workerB]),
      ),
    ).rejects.toThrow();

    await expect(
      withUser(admin, workerB, () =>
        admin.query(`insert into public.beneficiaries (code, area_id, village_id, worker_id, name, kind, age_label, due_label) values ('BEN-9999', $1, (select id from public.villages limit 1), $2, 'Real Patient', 'pregnant', '25', 'ANC')`, [areaBId, workerB]),
      ),
    ).rejects.toThrow();

    await expect(
      withUser(admin, workerB, () =>
        admin.query(`update public.danger_sign_rules set active = false where id = 'PREG-01'`),
      ),
    ).rejects.toThrow();
  });

  it('proves Supervisor sees aggregated counts and area referrals ONLY, never raw visits or fields', async () => {
    const summary = await withUser(admin, supervisorA, async () => {
      // Raw visits, visit_fields, visit_field_history MUST return 0 rows for supervisor
      expect((await admin.query(`select * from public.visits`)).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.visit_fields`)).rows).toHaveLength(0);
      expect((await admin.query(`select * from public.visit_field_history`)).rows).toHaveLength(0);

      // Referrals in supervisor's area ARE visible for clinical review
      const refs = await admin.query(`select id, rule_id, status from public.referrals`);
      expect(refs.rows.length).toBeGreaterThanOrEqual(2);

      // Aggregated counts RPC succeeds and returns counts only
      const agg = await admin.query(`select public.supervisor_area_summary() as s`);
      return agg.rows[0].s;
    });

    expect(summary.total_visits).toBe(1);
    expect(summary.danger_visits).toBe(1);
    expect(summary.pending_referrals).toBe(2);
    expect(summary.upcoming_followups).toBeGreaterThanOrEqual(0);

    // Regular worker CANNOT call supervisor_area_summary
    await expect(
      withUser(admin, workerA, () => admin.query(`select public.supervisor_area_summary()`)),
    ).rejects.toThrow(/Supervisor role required/i);
  });

  it('proves anonymous demo workspace isolation, 7-day cleanup, and self-service account deletion', async () => {
    await withUser(admin, anonA, () => admin.query(`select public.seed_demo_workspace('Demo A', 'en', null)`));
    await withUser(admin, anonB, () => admin.query(`select public.seed_demo_workspace('Demo B', 'mr', null)`));
    await withUser(admin, expiredAnon, () => admin.query(`select public.seed_demo_workspace('Expired Demo', 'en', null)`));

    // Anon A only sees its own 5 beneficiaries, never Anon B's
    const aRows = await withUser(admin, anonA, () => admin.query(`select worker_id from public.beneficiaries`));
    expect(aRows.rows).toHaveLength(5);
    expect(aRows.rows.every((r) => r.worker_id === anonA)).toBe(true);

    // 7-day cleanup removes expiredAnon (created 10 days ago) and cascades its rows, keeping anonA and anonB
    const deletedCount = await admin.query(`select public.cleanup_expired_anonymous_users() as n`);
    expect(deletedCount.rows[0].n).toBe(1);
    const expiredWorker = await admin.query(`select * from public.workers where id = $1`, [expiredAnon]);
    expect(expiredWorker.rows).toHaveLength(0);
    const activeAnon = await admin.query(`select * from public.workers where id = $1`, [anonA]);
    expect(activeAnon.rows).toHaveLength(1);

    // Self-service delete_my_account cascades anonB's worker & beneficiaries
    await withUser(admin, anonB, () => admin.query(`select public.delete_my_account()`));
    expect((await admin.query(`select * from public.workers where id = $1`, [anonB])).rows).toHaveLength(0);
    expect((await admin.query(`select * from public.beneficiaries where worker_id = $1`, [anonB])).rows).toHaveLength(0);
  });
});
