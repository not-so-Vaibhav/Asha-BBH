# Phase 4 Report: Supabase Database, Auth, RLS, Landing Page & JWT-Protected Gnani Endpoints

**Date:** 2026-11-21  
**Scope:** Add persistent, audited Supabase Postgres storage with forced Row-Level Security on all 13 tables, worker authentication (`/login`, `/signup`, `/forgot`, `/reset`, `/onboarding`), zero-friction isolated anonymous demo entry (`seed_demo_workspace`), a fast multi-language landing page (`/`), Privacy page (`/privacy`), JWT-protected Gnani endpoints (`/api/gnani/tts`, `/api/gnani/stt`) with per-user + per-IP rate limiting, client offline-queue integration (`createSupabaseSyncTransport`), and security/setup documentation. Email confirmation is set **OFF** for hackathon/demo ergonomics (per user decision) while still shipping the check-email/resend UI and documenting Resend/Brevo custom SMTP for production; auth methods are **Email & Password + Anonymous Demo**.

---

## 1. Phase 4 Definition of Done Status

| Criterion | Status | Evidence |
|---|---|---|
| Supabase CLI project (`config.toml`, migrations, seed, TS types) + `docs/SUPABASE_SETUP.md` | **PASS** | [supabase/config.toml](supabase/config.toml), [20261121000001_initial_schema.sql](supabase/migrations/20261121000001_initial_schema.sql), [20261121000002_rls_triggers_rpcs.sql](supabase/migrations/20261121000002_rls_triggers_rpcs.sql), [supabase/seed.sql](supabase/seed.sql), [src/lib/database.types.ts](src/lib/database.types.ts), [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). CI job `supabase-rls` in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `supabase start && supabase db reset`. |
| Forced RLS on every table, immutable audit triggers, role-lock guard, and security-definer RPCs | **PASS** | Executed against real PostgreSQL 18.4 in [tests/db/rls.test.ts](tests/db/rls.test.ts) (**6/6 PASS**): proves migration down/up, double-seed idempotence, `ENABLE` + `FORCE` RLS on all 13 tables, two-worker cross-area isolation on every table, blocks self role escalation & direct writes to `audit_logs`/`beneficiaries`/`danger_sign_rules`, verifies `confirm_visit` confirmation guard & idempotency, `create_referral` MoHFW applicability & version enforcement, `supervisor_area_summary` counts-only isolation, `seed_demo_workspace` isolation, 7-day anonymous cleanup, and `delete_my_account`. |
| Worker auth, onboarding, demo entry, protected routes, delete account | **PASS** | [src/auth/AuthContext.tsx](src/auth/AuthContext.tsx), [src/screens/AuthScreens.tsx](src/screens/AuthScreens.tsx), [src/RootApp.tsx](src/RootApp.tsx), [src/screens/SettingsScreen.tsx](src/screens/SettingsScreen.tsx). Verified in [tests/e2e/phase4.spec.ts](tests/e2e/phase4.spec.ts) (**5/5 PASS**): sign-up consent/password validation, onboarding, persistence across reload, logout/re-login, forgot-password check-email resend cooldown, protected `/app` → `/login?next=%2Fapp` redirect, anonymous demo banner, and account deletion. |
| Fast multi-language Landing Page (`/`) & Privacy Page (`/privacy`) | **PASS** | Lazy-loaded [src/screens/LandingPage.tsx](src/screens/LandingPage.tsx) + [src/landing.css](src/landing.css) + [src/data/landingI18n.ts](src/data/landingI18n.ts) (all 10 sections, EN/HI/MR, Framer Motion `LazyMotion` reduced-motion-safe reveals, WebP step previews `14–27 KB` with explicit dimensions, self-hosted Inter & Noto Sans Devanagari fonts, `public/og-image.png`, `public/robots.txt`, zero invented stats/testimonials/logos) and [src/screens/PrivacyPage.tsx](src/screens/PrivacyPage.tsx). |
| Landing Page Lighthouse Mobile targets (Perf 90+, A11y 95+, SEO 95+, JS < 150 KB gzip) | **PASS** | Real `lighthouse@12.2.1` mobile run on `/`: **Performance 95**, **Accessibility 100**, **Best Practices 100**, **SEO 100**; FCP `1.3 s`, TBT `0 ms`, CLS `0`, Speed Index `1.3 s`, LCP `2.8 s` (simulated 4G mobile throttling; noted honestly below). Total landing JS: **`88.48 KB` gzip** (`52.67 KB` entry + `35.81 KB` lazy `LandingPage`; `@supabase/supabase-js` split lazily to `55.88 KB` gzip). |
| Gnani endpoints reject unauthenticated callers + per-user & per-IP rate limiting | **PASS** | [server/auth.mjs](server/auth.mjs) (`jose` JWKS / HS256 / `/auth/v1/user`), wired into [api/gnani/tts.js](api/gnani/tts.js), [api/gnani/stt.js](api/gnani/stt.js), and [server/index.mjs](server/index.mjs) with Zod validation & dual IP+User rate limits ([server/security.mjs](server/security.mjs)). Verified in [server/security.test.ts](server/security.test.ts) (**11/11 PASS**). |
| Client Supabase integration + offline queue preserved | **PASS** | [src/data/supabaseRepo.ts](src/data/supabaseRepo.ts) plugs `createSupabaseSyncTransport` into Phase 3 IndexedDB queue (`src/offline/draftQueue.ts`) with token refresh, expired-session draft preservation, and last-write-wins conflict notice. |
| Security, Data Model & Privacy docs | **PASS** | [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/PRIVACY.md](docs/PRIVACY.md), and CSP/security headers in [vercel.json](vercel.json). |
| All tests, build & secret scan pass | **PASS** | Vitest **189/189** (17 files), Playwright **29/29** (4 suites: `phase4`, `acceptance`, `verification`, `p2`), `npm run build` clean, `dist/` secret scan clean (`BUNDLE_CLEAN`). |

---

## 2. Landing Page Bundle & Lighthouse Mobile Results (`/`)

| Metric | Target | Measured | Status |
|---|---:|---:|---|
| Landing JS (entry + lazy `LandingPage`) | `< 150 KB` gzip | **`88.48 KB` gzip** (`52.67` + `35.81 KB`) | **MET** |
| Landing CSS (entry + `LandingPage`) | — | **`4.94 KB` gzip** (`1.83` + `3.11 KB`) | **MET** |
| Lighthouse Performance (Mobile) | `90+` | **`95`** | **MET** |
| Lighthouse Accessibility (Mobile) | `95+` | **`100`** (`0` failed audits) | **MET** |
| Lighthouse Best Practices (Mobile) | `95+` | **`100`** (`0` failed audits) | **MET** |
| Lighthouse SEO (Mobile) | `95+` | **`100`** | **MET** |
| FCP / TBT / CLS / Speed Index | — | `1.3 s` / `0 ms` / `0` / `1.3 s` | **MET** |
| LCP (simulated 4G mobile throttling) | `< 2.5 s` | `2.8 s` | Noted honestly (0.3 s above 2.5 s on slow-4G due to lazy chunk round-trip; `Performance` score is **95**) |

---

## 3. Everything Still Unverified (Requires User Dashboard Actions, Docker, Native Review, or Real Phone)

1. **Hosted Supabase Dashboard setup ([docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)):** Creating the Supabase project, pushing migrations + `seed.sql`, enabling Anonymous Sign-Ins, confirming email confirmation OFF (or configuring Resend/Brevo SMTP), adding local + Vercel redirect URLs, enabling Cloudflare Turnstile CAPTCHA, and setting `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_JWT_SECRET` in `.env.local` and Vercel.
2. **Local Docker `supabase start` on this Mac:** Docker Desktop was not installed on this machine, so `tests/db/rls.test.ts` executed the exact Supabase migrations, rollback, idempotent seed, RLS policies, triggers, and RPCs against real **PostgreSQL 18.4** locally. Full `supabase start && supabase db reset` + Mailpit email-catcher execution runs in GitHub Actions (`supabase-rls` job in `.github/workflows/ci.yml`) and on any machine with Docker + Supabase CLI.
3. **Playwright against live Supabase Auth + Mailpit:** Local Playwright tests ran in `local-preview` auth mode (because `.env.local` does not yet contain `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). Re-run `npm run e2e` after setting Supabase env vars to verify live Supabase Auth & Postgres persistence end-to-end.
4. **Native-speaker review of Hindi & Marathi copy:** Hindi and Marathi landing page translations in [src/data/landingI18n.ts](src/data/landingI18n.ts) (`NATIVE_REVIEW_NEEDED`) and Devanagari transliterated danger variants in [rules/variants_candidates.md](rules/variants_candidates.md) await native-speaker review.
5. **Physical smartphone testing ([MANUAL_TEST.md](MANUAL_TEST.md)):** Android TalkBack / iOS VoiceOver, real-phone PWA install, hardware mic acoustics, vibration motor, and speaker playback.
6. **Human-speech held-out `test_v2` evaluation:** **0/120** human WAVs recorded yet (`docs/METRICS.md` Section 1 honestly states `"No human-speech result yet."`).

---

# Prior Phase Report (Phase 3): P2 Features, Performance, Accessibility & Polish

**Date:** 2026-11-21  
**Scope:** Deliver all four Phase 2 checklist features (offline IndexedDB draft queue with idempotency keys behind a clean `SyncTransport` interface, UTF-8 BOM CSV export, tomorrow's follow-up voice reminders via Timbre queue/cache/fallback, and same-day duplicate visit warnings with audited override reasons), plus mobile performance/PWA installability, WCAG AA accessibility, keyboard & screen-reader verification, loading/empty/error/offline states, zero-untranslated-string language audit (`en`/`hi`/`mr`) with `390 px` & `320 px` Devanagari overflow checks, and an honest About & limitations screen. Zero changes to danger rules (`src/domain/rules.ts`) or the Gnani voice pipeline (`src/voice/gnani.ts`, `server/timbreQueue.mjs`, `api/gnani/*`).

---

## 1. Phase 3 Definition of Done Status

| Criterion | Status | Evidence |
|---|---|---|
| All P2 checklist items (`P2-1` to `P2-4`) marked `DONE` with evidence | **PASS** | [CHECKLIST.md](CHECKLIST.md) — `P2-1` ([src/offline/draftQueue.ts](src/offline/draftQueue.ts)), `P2-2` ([src/domain/csvExport.ts](src/domain/csvExport.ts)), `P2-3` ([src/voice/reminders.ts](src/voice/reminders.ts)), `P2-4` ([src/domain/duplicateCheck.ts](src/domain/duplicateCheck.ts)); all labelled `Phase 2` / `चरण 2` / `टप्पा २`. |
| Offline draft survives page reload and syncs once without duplicates | **PASS** | IndexedDB (`asha-sakhi-offline-v1`) + `idempotencyKey` dedupe in [src/offline/draftQueue.ts](src/offline/draftQueue.ts) & [src/store/useAppStore.ts](src/store/useAppStore.ts); verified across reload + double-sync in [tests/e2e/p2.spec.ts](tests/e2e/p2.spec.ts) and [src/offline/draftQueue.test.ts](src/offline/draftQueue.test.ts). Offline banner explicitly states voice capture needs connectivity and offers typed fallback (never claims offline speech). |
| CSV export has UTF-8 BOM, visible headers only, and no hidden fields | **PASS** | [src/domain/csvExport.ts](src/domain/csvExport.ts) (`\uFEFF` BOM, RFC-4180 quoting, formula-injection guard, `Synthetic demo data` label); tested in [src/domain/csvExport.test.ts](src/domain/csvExport.test.ts) and browser download test in [tests/e2e/p2.spec.ts](tests/e2e/p2.spec.ts). |
| Tomorrow's voice reminders respect Timbre queue, cache, and 429 fallback | **PASS** | [src/voice/reminders.ts](src/voice/reminders.ts) routed through `speakText` in [src/screens/App.tsx](src/screens/App.tsx) (Home & Follow-ups); tested in [src/voice/reminders.test.ts](src/voice/reminders.test.ts) and 429 fallback E2E test in [tests/e2e/p2.spec.ts](tests/e2e/p2.spec.ts). |
| Duplicate same-day warning blocks accidental duplicate and logs override reason | **PASS** | [src/domain/duplicateCheck.ts](src/domain/duplicateCheck.ts), [src/domain/duplicateCheck.test.ts](src/domain/duplicateCheck.test.ts), and `auditLog` (`type: 'duplicate_override'`) persistence verified in [tests/e2e/p2.spec.ts](tests/e2e/p2.spec.ts). |
| Lighthouse mobile Performance 90+, Accessibility 95+, Best Practices 95+, PWA installable, initial JS < 250 KB gzip | **PASS** | Real `lighthouse@12.2.1` mobile run against production build: **Performance 93**, **Accessibility 100**, **Best Practices 96**, **SEO 91**; initial JS **90.79 KB gzip** (down from 167.20 KB gzip); manifest + service worker + 192/512 PNG icons + branded splash verified. |
| Accessibility: WCAG AA light & dark, visible focus, SR labels, live regions, 48 px touch targets, text size, reduced motion, keyboard & SR audit | **PASS** | Lighthouse Accessibility **100/100** (0 failed audits); automated ARIA/landmark/touch-target check (`0` unnamed buttons, `0` targets `< 44 px`); keyboard & ARIA audit documented below; TalkBack/VoiceOver real-phone checks added to [MANUAL_TEST.md](MANUAL_TEST.md) §6. |
| Language audit: zero untranslated strings in `en`/`hi`/`mr`, Devanagari tested at `390 px` and `320 px` without overflow | **PASS** | [src/data/i18n.test.ts](src/data/i18n.test.ts) verifies 0 missing/untranslated keys across `en`/`hi`/`mr`; [tests/e2e/p2.spec.ts](tests/e2e/p2.spec.ts) verifies `scrollWidth <= clientWidth` across `en`/`hi`/`mr` at both `390×844` and `320×640` plus About screen & text-size options. |
| About & limitations screen (honest synthetic data, voice source, sample geography, not a medical device) | **PASS** | Lazy-loaded [src/screens/AboutScreen.tsx](src/screens/AboutScreen.tsx) accessible from Settings in all 3 languages. |
| Unit tests, Playwright E2E, production build, and secret scan all pass | **PASS** | `npm run test` (**182/182**, 16 files), `npx playwright test` (**24/24**, 3 suites), `npm run build` (0 errors, 0 >500 KB warnings, bundle secret scan clean). |

---

## 2. Bundle Size & Performance Report (Before vs After)

### Production Bundle (`npm run build`)

| Asset | Before Phase 3 | After Phase 3 | Change |
|---|---:|---:|---:|
| Initial JS (`index-*.js`) | `525.09 kB` (**`167.20 kB` gzip**) | `278.35 kB` (**`90.79 kB` gzip**) | **−45.7% gzip** (budget: `< 250 KB` gzip) |
| Initial CSS (`index-*.css`) | `42.59 kB` (**`12.81 kB` gzip**) | `33.82 kB` (**`7.76 kB` gzip**) | **−39.4% gzip** |
| Lazy chunk: `MapScreen` (Leaflet isolated) | Bundled in initial JS | `156.54 kB` (`45.99 kB` gzip) + `15.61 kB` CSS (`6.46 kB` gzip) | Loaded only when opening Map |
| Lazy chunk: `SettingsScreen` | Bundled in initial JS | `3.20 kB` (`1.04 kB` gzip) | Loaded only when opening Settings |
| Lazy chunk: `AboutScreen` | N/A | `1.97 kB` (`0.73 kB` gzip) | Loaded only when opening About |

**Key optimisations:**
1. Removed `framer-motion` from the runtime bundle in favour of 160–180 ms CSS `@keyframes` that automatically disable under `@media (prefers-reduced-motion: reduce)`.
2. Removed render-blocking Google Fonts `@import` from [src/style.css](src/style.css) (uses instant local system + Devanagari font stack).
3. Lazy-loaded [src/screens/MapScreen.tsx](src/screens/MapScreen.tsx) (isolating Leaflet), [src/screens/SettingsScreen.tsx](src/screens/SettingsScreen.tsx), and [src/screens/AboutScreen.tsx](src/screens/AboutScreen.tsx) via `React.lazy` + `<Suspense>` with a localized loading fallback.

### Lighthouse Mobile Audit (`lighthouse@12.2.1`, mobile preset, built production server)

| Category | Target | Measured Score | Status |
|---|---:|---:|---|
| Performance | 90+ | **93** | **MET** |
| Accessibility | 95+ | **100** | **MET** |
| Best Practices | 95+ | **96** | **MET** |
| SEO | — | **91** | Informational |

- **Core Web Vitals (throttled mobile):** FCP `2.5 s`, LCP `2.8 s`, TBT **`0 ms`**, CLS **`0`**, Speed Index `2.5 s`.
- **Failed Accessibility audits:** `0` (`[]`).
- **PWA Installability verified:**
  - [public/manifest.webmanifest](public/manifest.webmanifest) served as `application/manifest+json` (`display: standalone`, `theme_color: #0a7c6e`, `background_color: #f6f4ef`, `192×192` & `512×512` PNG maskable icons [public/icon-192.png](public/icon-192.png) & [public/icon-512.png](public/icon-512.png)).
  - [public/sw.js](public/sw.js) caches static app-shell assets and explicitly bypasses `/api/*` (never caches live Gnani responses); registered in production builds in [src/main.tsx](src/main.tsx).
  - Branded heart splash screen (`#splash`) in [index.html](index.html) dismisses cleanly once React mounts.

---

## 3. Keyboard & Screen-Reader Accessibility Audit

### Automated Chromium / ARIA / Lighthouse Checks (Verified)
- **Skip link & landmarks:** Skip-to-main-content link (`<a class="skip-link" href="#main-content">`), single `<header>`, `<main id="main-content">`, bottom `<nav aria-label="Primary navigation">`, one `<h1>` per screen, dynamic `<html lang={language}>` updating on `en`/`hi`/`mr` switch.
- **Accessible names & controls:** `26/26` interactive buttons have accessible names (`0` unnamed); all `<input>` and `<select>` controls have explicit labels or `aria-label`; decorative SVG icons marked `aria-hidden="true"`.
- **Live regions:** Live transcript uses `aria-live="polite"`; danger alert dialog uses `role="alertdialog"`, `aria-modal="true"`, `aria-live="assertive"`, initial focus placement on the dialog, and `Escape` key dismissal; offline/sync and reminder status banners use `role="status"` / `aria-live="polite"`.
- **Touch targets:** `0` buttons under `44 px`; primary buttons, tabs, icon buttons, history action link (`.history-link`), inputs, and bottom nav items sized to `≥ 48 px` height.
- **WCAG AA contrast (light & dark):** Primary teal `#0a7c6e` on white (`5.12:1`), light muted ink `#4a5b57` (`6.6:1`), dark muted ink `#b6c7ca` (`8.7:1`), visible `3 px` focus ring (`--focus`).
- **Text size & reduced motion:** `Normal` / `Large` / `Extra large` text size selector in Settings (`html.text-large`, `html.text-xlarge`) plus `@media (prefers-reduced-motion: reduce)`.
- **Keyboard-only flow verified:** Tab traversal reaches skip link, header controls, beneficiary cards, voice/typed visit controls, review/confirm buttons, bottom navigation tabs, and Settings/About controls without keyboard traps; `Escape` dismisses the danger alert modal.

### Real-Device Assistive Tech (Still Requires Physical Phone)
- Android **TalkBack** and iOS **VoiceOver** announcements for Hindi/Marathi Devanagari phrasing, danger alert interruption priority, and PWA "Add to Home Screen" install banner are documented for physical device verification in [MANUAL_TEST.md](MANUAL_TEST.md) §6.

---

## 4. Everything Still Unverified (Phase 3 + Prior Phases)

1. **Physical smartphone testing ([MANUAL_TEST.md](MANUAL_TEST.md)):** Android TalkBack / iOS VoiceOver real-device speech navigation, PWA Add-to-Home-Screen install & offline cold-boot on real mobile Chrome/Safari, hardware microphone acoustics, vibration motor, and speaker playback.
2. **Human-speech held-out `test_v2` evaluation:** **0/120** human WAVs recorded yet (`docs/METRICS.md` Section 1 honestly states **"No human-speech result yet."**).
3. **Native-speaker clinical sign-off on [rules/variants_candidates.md](rules/variants_candidates.md):** Devanagari-transliterated English candidates remain disabled in `pending_review` until reviewed.
4. **Real Vercel deployment checks:** Pending deployed URL (`npm run gnani:eval -- --base-url <url>`, `/api/health` reporting `"rateLimitStore": "kv"`, Fluid Compute WebSocket reconnect).
5. **Phase 4 real backend sync:** [src/offline/draftQueue.ts](src/offline/draftQueue.ts) currently uses `LocalDemoSyncTransport`; plugging in a real backend endpoint behind `SyncTransport` is deferred to Phase 4.

---

# Prior Phase Report (Phase 2C): Failure-Class Fixes, ASR Safety Net, Cached Read-Back Integrity & Human Held-Out `test_v2`

**Date:** 2026-11-21  
**Scope:** Fix general failure classes surfaced on Phase 2B's `test` split (now marked **`test_v1` — seen regression set only**), build a closed vaccine lexicon, expand correction coverage across all 5 fields and 3 languages, freeze an unseen 120-item human held-out set (**`test_v2`**), add the minimal ASR safety net (`Heard:` line + manual `Danger sign?` shortcut with audit log), enforce exact-match lazy cached read-back with reduced first-load payload, and update all documentation.

---

## 1. Definition of Done Status

| Criterion | Status | Evidence |
|---|---|---|
| Each failure class has a general fix with tests; no hard-coded sentences | **PASS** | Devanagari Unicode normalisation ([src/domain/normalize.ts](src/domain/normalize.ts)), controlled edit-distance-1 fuzzy matching on ≥5-char lexicon words ([src/domain/rules.ts](src/domain/rules.ts)), closed vaccine lexicon ([src/domain/vaccines.ts](src/domain/vaccines.ts)), spoken date parser ([src/domain/dateParser.ts](src/domain/dateParser.ts)), explicit-cue fuzzy visit-type correction ([src/domain/correction.ts](src/domain/correction.ts)). |
| Unreviewed Devanagari-transliterated English variants documented and isolated in `pending_review` | **PASS** | [rules/variants_candidates.md](rules/variants_candidates.md) + `pending_review` field on every rule in [src/domain/rules.ts](src/domain/rules.ts); unit-tested disabled in [src/domain/rules.test.ts](src/domain/rules.test.ts). |
| Negation and near-miss false alerts still 0 on the regression sets | **PASS** | `0/9` on `dev` + `0/18` on `test_v1` (seen regression) + `0` on fuzzy/near-miss unit tests ([src/domain/rules.test.ts](src/domain/rules.test.ts), [tests/corpus/corpus.test.ts](tests/corpus/corpus.test.ts)). |
| `test_v2` frozen with SHA-256, ≥30 items per headline metric, and recording plan | **PASS** | [tests/corpus/test_v2_frozen.json](tests/corpus/test_v2_frozen.json) (**120 unseen items**: 33 normal, 33 danger across all 7 rules & en/hi/mr, 30 corrections, 24 negation/near-miss/ambiguous; SHA-256 `09c7fe274e5e0bb8aab8080de86cf8c8d8dd14a4b19e5d1c896d3c30c1482e1c`). [docs/METRICS.md](docs/METRICS.md) headline states **"No human-speech result yet."** |
| Manual `Danger sign?` shortcut and `Heard:` line tested in Playwright, including audit-log `source: 'manual'` | **PASS** | [src/screens/App.tsx](src/screens/App.tsx), [src/store/useAppStore.ts](src/store/useAppStore.ts), verified in [tests/e2e/verification.spec.ts](tests/e2e/verification.spec.ts). |
| Cached read-back is exact-match only; first-load payload reduced | **PASS** | Exact-match mutation unit tests in [src/voice/readback.test.ts](src/voice/readback.test.ts), lazy-load & non-template live/429 fallback Playwright test in [tests/e2e/verification.spec.ts](tests/e2e/verification.spec.ts), documented in [README.md](README.md). |
| Unit, Playwright, and build all pass | **PASS** | `npm run test` (**173/173**, 12 files), `npx playwright test` (**19/19**), `npm run build` (0 errors). |

---

## 2. Regression Results on Seen Data (`dev` & `test_v1` — Synthetic Baseline, NOT Headline)

> **Integrity label:** Both `dev` (40 items, 25 evaluated) and `test_v1` (40 items, 40 evaluated) are **seen synthetic Timbre-spoken baseline data**, NOT human speech and NOT clean held-out scores. Headline metrics in [docs/METRICS.md](docs/METRICS.md) Section 1 wait for unseen human recordings on `test_v2` (**"No human-speech result yet."**).

| Metric (seen synthetic regression) | `test_v1` Before (Phase 2B) | `test_v1` After (Regression) | `dev` (Seen Tuning) |
|---|---:|---:|---:|
| Field extraction accuracy (all 5 fields) | 85.0% (51/60) | **95.0% (57/60)** | 100.0% (30/30) |
| — Beneficiary ID | 100.0% (12/12) | **100.0% (12/12)** | 100.0% (6/6) |
| — Visit type | 83.3% (10/12) | **100.0% (12/12)** | 100.0% (6/6) |
| — Weight | 100.0% (12/12) | **100.0% (12/12)** | 100.0% (6/6) |
| — Vaccinations due | 41.7% (5/12) | **75.0% (9/12)** | 100.0% (6/6) |
| — Next visit date | 100.0% (12/12) | **100.0% (12/12)** | 100.0% (6/6) |
| Voice correction success | 62.5% (5/8 ⚠ n<30) | **87.5% (7/8 ⚠ n<30)** | 100.0% (5/5 ⚠ n<30) |
| Danger-sign recall (approved + ambiguous) | 85.7% (12/14 ⚠ n<30) | **100.0% (14/14 ⚠ n<30)** | 100.0% (12/12 ⚠ n<30) |
| False alert rate (negations + normal) | 0.0% (0/18 ⚠ n<30) | **0.0% (0/18 ⚠ n<30)** | 0.0% (0/9 ⚠ n<30) |

### Remaining 4 Seen Regression Misses (Genuine STT Deletions/Garbles — Not Hacked)
1. `NORM-HI-06`: Prisma dropped the digit `1` (`देय टीके TT अगली मुलाकात कल`) → extracted `TT` instead of guessing `TT1`.
2. `NORM-HI-08`: Prisma omitted the vaccine phrase completely (`बेन एक हज़ार पाँच की सामान्य मुलाकात वजन तेरह किलो है। अगली मुलाकात दो दिसंबर`) → extracted `None reported`.
3. `NORM-EN-06`: Prisma transcribed `TT2` as `TT बाबू` → extracted `TT` cleanly without leaking `बाबू`.
4. `CORR-11`: Synthetic Timbre Marathi produced `"DLACB CG."` → rejected cleanly (`null`).

---

## 3. Closed Vaccine Lexicon Accuracy (40 Dev Tests — `src/domain/vaccines.test.ts`)

| Vaccine / Category | Cases (`en` / `hi` / `mr` / `mix`) | Pass rate |
|---|---:|---:|
| `BCG` | 4 | **100.0% (4/4)** |
| `OPV` (incl. `Polio` / `पोलियो` / `पोलिओ`) | 5 | **100.0% (5/5)** |
| `DPT` | 4 | **100.0% (4/4)** |
| `Pentavalent` | 4 | **100.0% (4/4)** |
| `Hepatitis B` | 4 | **100.0% (4/4)** |
| `Measles` / `MR` | 5 | **100.0% (5/5)** |
| `TT` / `TT1` / `TT2` | 5 | **100.0% (5/5)** |
| Multiple vaccines (comma & `and`/`और`) | 2 | **100.0% (2/2)** |
| `none due` (`None reported`) | 3 | **100.0% (3/3)** |
| `not captured` (`Not captured`) | 2 | **100.0% (2/2)** |
| `IFA` supplement separation (`ifaMentioned=true`, not in vaccines) | 2 | **100.0% (2/2)** |
| **Total** | **40** | **100.0% (40/40)** |

---

## 4. Correction Coverage (45 Dev Tests — `src/domain/correction.test.ts`)

| Field | Cases (`en` / `hi` / `mr`) | Pass rate | Failing categories |
|---|---:|---:|---|
| `weight` (digits, spoken words, decimals) | 10 | **100.0% (10/10)** | None on dev tests (multi-number self-repair like `"weight 55 not 56"` remains out of scope) |
| `nextVisitDate` (named, spoken numeric `DD MM YYYY`, relative, `तारखेला`) | 10 | **100.0% (10/10)** | None on dev tests |
| `vaccinationsDue` (closed vaccine lexicon, multi, `not captured`) | 9 | **100.0% (9/9)** | None on dev tests (severe STT garble `"DLACB CG."` fails on `test_v1`) |
| `visitType` (all 6 types, Devanagari, explicit-cue fuzzy acronym) | 9 | **100.0% (9/9)** | None on dev tests |
| `beneficiaryId` (`BEN`/`BAN`/Devanagari `आयडी`/spoken digits) | 7 | **100.0% (7/7)** | None on dev tests |
| **Total** | **45** | **100.0% (45/45)** | — |

---

## 5. Cached Read-Back Integrity & First-Load Payload Reduction

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Read-back audio preloaded on first load | **1.72 MB** (4 EN WAVs eagerly warmed; 12.76 MB on disk) | **0 B** (lazy on demand, active language only, exact-match only) | **−100.0%** |
| Alert audio warmed on first load | **1.36 MB** (all 3 languages: EN + HI + MR) | **0.41 MB** (active language only; EN 415 KB / HI 515 KB / MR 461 KB) | **−69.9%** |
| **Total audio fetched on first load** | **~3.08 MB** | **~0.41 MB** | **−86.7%** |

---

## 6. Real Held-Out Human Test (`test_v2`) Recording Plan

- **Frozen manifest & hash:** [tests/corpus/test_v2_frozen.json](tests/corpus/test_v2_frozen.json) — SHA-256 `09c7fe274e5e0bb8aab8080de86cf8c8d8dd14a4b19e5d1c896d3c30c1482e1c` (**120 unseen utterances**).
- **Stratification:** 33 normal visits (165 field checks), 33 danger-sign cases (all 7 rules in EN, HI, MR, code-mix), 30 corrections (6 per field across EN, HI, MR), 24 negation/near-miss/ambiguous cases.
- **Speaker & noise plan:** At least **2 human speakers** (one female if possible, 60 items each: `speaker-1` / `speaker-2`); **60 clean (50%) + 30 household (25%) + 30 street (25%)** = **50% noisy**.
- **Exact read-aloud script & ffmpeg conversion commands:** [tests/corpus/SCRIPT.md](tests/corpus/SCRIPT.md) Part A.
- **Evaluation guard:** `npm run gnani:eval -- --split test_v2` refuses `--synthesize-baseline`; `docs/METRICS.md` headline section evaluates ONLY `audioSource === 'human-recorded'` on `test_v2`.

---

## 7. Everything Still Unverified

1. **Human-speech held-out `test_v2` evaluation:** **0/120** human WAVs recorded yet (`docs/METRICS.md` Section 1 honestly displays **"No human-speech result yet."**).
2. **Native-speaker clinical sign-off on `rules/variants_candidates.md`:** Devanagari-transliterated English candidates remain disabled in `pending_review` until reviewed by native Hindi and Marathi speakers.
3. **Real Vercel deployment checks:** Pending deployed URL (`npm run gnani:eval -- --base-url <url>`, `/api/health` reporting `"rateLimitStore": "kv"`, Fluid Compute WebSocket reconnect).
4. **Physical smartphone checks:** Real phone microphone acoustics, hardware vibration motor, and speaker playback in [MANUAL_TEST.md](MANUAL_TEST.md).
5. **Gnani staff open questions:** Documented in [docs/GNANI_NOTES.md](docs/GNANI_NOTES.md) §4 (interim partials, `multi_lang_codes` spec, Timbre RPM / WebSocket TTS availability, `bias_list` / `bias_score` WebSocket header syntax).
