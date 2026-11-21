# Supabase Dashboard & Local Setup Guide

Follow these numbered steps to connect ASHA SAKHI to a live Supabase project (and to run locally with the Supabase CLI).

---

## Part 1: Local Development (Supabase CLI)

> Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or OrbStack) and the [Supabase CLI](https://supabase.com/docs/guides/cli).

1. **Install Supabase CLI** (if not installed):
   ```bash
   brew install supabase/tap/supabase
   ```
2. **Start local Supabase stack and apply migrations + seed:**
   ```bash
   supabase start
   supabase db reset
   ```
   - Local API URL: `http://127.0.0.1:54321`
   - Local Studio: `http://127.0.0.1:54323`
   - Local Mailpit (email catcher for forgot-password testing): `http://127.0.0.1:54324`
3. **Copy the printed `API URL`, `anon key`, and `JWT secret` into `.env.local`** (never commit `.env.local`):
   ```env
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<local-anon-key>
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<local-anon-key>
   SUPABASE_JWT_SECRET=<local-jwt-secret>
   REQUIRE_AUTH=true
   ```
4. **Regenerate TypeScript types whenever migrations change:**
   ```bash
   supabase gen types typescript --local > src/lib/database.types.ts
   ```
5. **Run the app:**
   ```bash
   npm run dev
   ```
6. **Run the full RLS & RPC database test suite against local Supabase:**
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run tests/db/rls.test.ts
   ```

---

## Part 2: Hosted Supabase Dashboard Setup (for Vercel Production)

1. **Create a Supabase project:**
   - Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
   - Choose a region close to India (e.g. **ap-south-1 (Mumbai)**) and set a strong database password.
2. **Push the schema migrations and synthetic seed data:**
   ```bash
   supabase login
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   ```
   *(Or paste `supabase/migrations/20261121000001_initial_schema.sql`, `20261121000002_rls_triggers_rpcs.sql`, and `supabase/seed.sql` into **Dashboard → SQL Editor** and run them in order.)*
3. **Enable Anonymous Sign-Ins (for zero-friction "Try the live demo"):**
   - Go to **Authentication → Providers → Anonymous Sign-Ins** → toggle **ON** and save.
4. **Configure Email Sign-Up Settings (Hackathon vs Production):**
   - **Recommended for Hackathon / Demo (currently configured in `supabase/config.toml`):**
     - Go to **Authentication → Providers → Email**.
     - Keep **Enable Email provider** ON.
     - Toggle **Confirm email** **OFF** so judges and testers enter onboarding immediately without hitting Supabase's built-in email rate limit (~2 emails/hr).
   - **Recommended for Production (Custom SMTP):**
     - Create a free account at [Resend](https://resend.com) or [Brevo](https://www.brevo.com) and verify a sender domain.
     - Go to **Project Settings → Authentication → SMTP Settings** → enable **Custom SMTP** and enter your SMTP host, port, username, and password/API key.
     - Then go to **Authentication → Providers → Email** and toggle **Confirm email** **ON**.
5. **Configure URL Redirects (Local + Vercel):**
   - Go to **Authentication → URL Configuration**:
     - **Site URL:** `https://<your-vercel-domain>.vercel.app`
     - **Redirect URLs** (add all):
       - `http://localhost:5173/**`
       - `http://127.0.0.1:4173/**`
       - `https://<your-vercel-domain>.vercel.app/**`
       - `https://*-<your-vercel-team>.vercel.app/**` *(for Preview deployments)*
6. **Enable CAPTCHA Protection (Recommended for public demo):**
   - Create a free [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) site (Widget Mode: Managed; add `localhost` and your Vercel domain).
   - In Supabase Dashboard → **Authentication → Attack Protection → Enable Captcha protection** → select **Cloudflare Turnstile** and paste your **Secret Key**.
   - Put the **Site Key** into `VITE_TURNSTILE_SITE_KEY` in Vercel (public key).
7. **Verify 7-Day Anonymous Cleanup Schedule:**
   - Go to **Database → Extensions** → ensure `pg_cron` is enabled.
   - Verify the job `asha-sakhi-cleanup-anon-users` (`0 3 * * *`) appears in `cron.job`, or run `select public.cleanup_expired_anonymous_users();` manually in SQL Editor.
8. **Set Environment Variables in `.env.local` and Vercel Project Settings:**
   - **Client-visible (safe public keys):**
     - `VITE_SUPABASE_URL` = Project URL (`https://<ref>.supabase.co`)
     - `VITE_SUPABASE_ANON_KEY` = `anon` `public` key
     - `VITE_TURNSTILE_SITE_KEY` = *(optional)* Cloudflare Turnstile site key
   - **Server-only (NEVER prefix with `VITE_`):**
     - `SUPABASE_URL` = Project URL
     - `SUPABASE_ANON_KEY` = `anon` `public` key
     - `SUPABASE_JWT_SECRET` = *(optional, from Project Settings → API → JWT Secret; required only if project uses HS256 instead of JWKS)*
     - `GNANI_API_KEY_ID` = Your Gnani API key
     - `KV_REST_API_URL` / `KV_REST_API_TOKEN` = *(recommended)* Upstash/Vercel KV for shared cross-instance rate limiting
   - **NEVER put `SUPABASE_SERVICE_ROLE_KEY` in `VITE_*` or client code.**

---

## Part 3: Promoting a Supervisor (Admin SQL Only)

Self-sign-up always assigns `role = 'worker'`, and database triggers + RLS prevent workers from changing their own role. To promote an existing signed-up account to a supervisor for an area, run this as a database administrator in **SQL Editor**:

```sql
update public.workers
set role = 'supervisor',
    area_id = (select id from public.areas where code = 'AREA-DEMO-A')
where id = '<AUTH_USER_UUID>';
```
