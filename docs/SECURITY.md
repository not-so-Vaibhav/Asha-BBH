# ASHA SAKHI Security Architecture

## 1. Threat Model

| Threat | Mitigation |
|---|---|
| Unauthenticated internet callers draining Gnani STT/TTS quota | `/api/gnani/tts` and `/api/gnani/stt` (including WebSocket upgrades) verify a valid Supabase JWT via `server/auth.mjs` (`jose` JWKS / HS256 / `/auth/v1/user`) and reject missing/invalid tokens with `401` / WS close `1008`. Production fails closed (`NODE_ENV=production` or `VERCEL=1`). |
| Cross-worker data access (IDOR) | Forced Postgres Row-Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY`) on all 13 `public.*` tables. Every worker query and RPC verifies `worker_id = auth.uid()` and `area_id = current_worker_area_id()`. Verified by automated cross-area RLS test suite (`tests/db/rls.test.ts`). |
| Privilege escalation (`worker` → `supervisor`) | Self-sign-up hardcodes `role = 'worker'`. Both RLS `WITH CHECK` and `BEFORE INSERT OR UPDATE` trigger `enforce_worker_role_guard()` reject any client attempt to insert or mutate `role`. |
| Audit trail tampering | `audit_logs` has zero `INSERT`/`UPDATE`/`DELETE` grants or policies for `authenticated`/`anon`. Writes occur exclusively via `SECURITY DEFINER` triggers on all write tables. |
| Client-forged referrals or unconfirmed saves | `referrals` blocks direct client `INSERT`; creation goes through `create_referral()` RPC which pulls authoritative `rule_version` and validates `applies_to` against `danger_sign_rules`. `confirm_visit()` rejects `p_confirmed <> true` and enforces idempotency by `idempotency_key`. |
| Anonymous demo abuse / database bloat | Cloudflare Turnstile / hCaptcha integration (`VITE_TURNSTILE_SITE_KEY` + Supabase Attack Protection), per-user + per-IP rate limiting, and daily `pg_cron` job `cleanup_expired_anonymous_users()` deleting anonymous users and cascading their rows after 7 days. |
| Secret leakage in frontend bundle | `GNANI_API_KEY_ID`, `SUPABASE_JWT_SECRET`, and `KV_REST_API_TOKEN` are strictly server-side; CI scans `dist/` and runs `gitleaks` on repository history. |
| Real patient PHI entered into prototype | Mandatory synthetic-data consent checkbox at sign-up, visible `"Synthetic demo data"` badge across all screens, `synthetic boolean not null default true` on patient-like tables, and workers cannot create arbitrary beneficiaries. |

---

## 2. Row-Level Security (RLS) Summary

All 13 tables in `public` have both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`:

- **`areas`, `villages`, `health_facilities`, `danger_sign_rules`**: `SELECT` only for `authenticated`.
- **`workers`**: `SELECT` / `INSERT` (`role = 'worker'`) / `UPDATE` (role immutable) / `DELETE` for own `id = auth.uid()`.
- **`households`, `beneficiaries`**: `SELECT` only for `worker` rows in own `area_id` & `worker_id = auth.uid()`. Workers cannot `INSERT` beneficiaries.
- **`visits`, `visit_fields`, `visit_field_history`, `followups`**: `SELECT` / `INSERT` / `UPDATE` strictly for `role = 'worker'` owning `worker_id = auth.uid()` and matching `area_id`. Supervisors have **zero** row-level read access to raw visits or fields.
- **`referrals`**: Workers read/update own area referrals; supervisors read/review referrals in their `area_id`. Direct client `INSERT` is revoked; creation uses `create_referral()` RPC.
- **`audit_logs`**: `SELECT` only `actor_id = auth.uid()`. All mutations blocked for `authenticated`/`anon`.

---

## 3. Key Handling

- **Public client keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`)**: Safe for browser bundles when RLS is enforced on every table.
- **Server-only secrets (`GNANI_API_KEY_ID`, `SUPABASE_JWT_SECRET`, `KV_REST_API_TOKEN`)**: Configured only in `.env.local` (gitignored) and Vercel Server Environment Variables.
- **Service role key**: Not required for normal app operation and never used for user-initiated reads or exposed to clients.

---

## 4. Rate Limits (Judge-Safe Defaults)

Enforced on **both** `ip:<clientIp>` and `user:<supabaseUserId>` via shared Upstash/Vercel KV REST (`server/security.mjs`) with automatic memory fallback:

| Endpoint | Per-User Limit | Per-IP Limit | Extra Guard |
|---|---:|---:|---|
| `/api/gnani/tts` | `60 req / min` (`GNANI_TTS_USER_RATE_LIMIT`) | `60 req / min` (`GNANI_TTS_RATE_LIMIT`, configurable for venue NAT) | Concurrency-1 server queue + 429 exponential backoff + 48-entry LRU cache |
| `/api/gnani/stt` | `20 sessions / min` (`GNANI_STT_USER_RATE_LIMIT`) | `20 sessions / min` (`GNANI_STT_RATE_LIMIT`) | Max 4 concurrent sessions/IP, 180 s session cap, 6 MB audio cap |

A normal 3-minute judge demo uses `1–3` STT sessions and `0–3` live Timbre calls (cached read-backs and alerts use `0` calls), well below all limits.

---

## 5. CAPTCHA & Anonymous Session Cleanup

- Enable Cloudflare Turnstile (or hCaptcha) in Supabase Dashboard → **Authentication → Attack Protection** and set `VITE_TURNSTILE_SITE_KEY` in Vercel to protect sign-up and anonymous demo entry.
- Anonymous demo users (`auth.users.is_anonymous = true`) older than **7 days** are automatically purged by `public.cleanup_expired_anonymous_users()`, cascading their cloned `workers`, `households`, `beneficiaries`, `visits`, `followups`, and `referrals`.

---

## 6. Security Headers & CSP

Configured in [vercel.json](../vercel.json) and `server/security.mjs`:
- `Content-Security-Policy` restricting scripts, frames, media, and connections to `'self'`, Supabase (`*.supabase.co`), OSM map tiles, and Turnstile/hCaptcha.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self), geolocation=(), camera=()`.
- API routes return `Cache-Control: no-store`.

---

## 7. Backup, Restore & Dependency Audit

- **Backups:** Hosted Supabase provides automated daily Postgres backups (Pro supports Point-in-Time Recovery). Schema and seed are version-controlled in `supabase/migrations/` and `supabase/seed.sql`, allowing deterministic rebuilds via `supabase db reset`.
- **Restore drill:** Run `psql "$TARGET_DB_URL" -f supabase/rollbacks/down.sql` followed by migrations and `seed.sql` (verified automatically in `tests/db/rls.test.ts`).
- **Dependency audit:** Run `npm audit --omit=dev` before each release; CI runs Vitest, RLS tests, bundle secret check, Playwright, and `gitleaks`.
