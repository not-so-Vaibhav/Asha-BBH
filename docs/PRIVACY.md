# ASHA SAKHI Privacy Statement

**Prototype & Synthetic Data Notice:** ASHA SAKHI is a research and hackathon prototype designed strictly for **synthetic demo data**. It is **not** a medical device and is **not** integrated with any government health registry. Workers must confirm at sign-up that they will not enter real patient names, contact details, or clinical data.

## 1. Data Stored About Worker Accounts
- **Email/password accounts:** Email address (managed by Supabase Auth), display name, demo ASHA ID, chosen sample area, preferred UI language (`en`, `hi`, `mr`), and synthetic-data consent timestamp.
- **Anonymous demo sessions ("Try the live demo"):** No email or password is collected. A temporary anonymous session ID is created to isolate your five synthetic beneficiaries from other visitors.

## 2. Visit Records, Excerpts & Audio
- **Zero audio storage:** Microphone audio streams directly over TLS to Gnani Prisma v3.0 for live transcription and is never saved to disk, object storage, or Postgres.
- **Structured fields only:** Confirmed visits store the five structured fields (beneficiary ID, visit type, weight, vaccinations due, next visit date) and field correction history.
- **Referral excerpts:** When a predefined MoHFW danger-sign rule triggers, only a bounded excerpt (≤ 240 characters) is stored on the referral row for review. Full raw transcripts are never exposed to supervisors.

## 3. Data Retention
- **Anonymous demo sessions:** Automatically deleted along with all cloned workspace records after **7 days** via `public.cleanup_expired_anonymous_users()`.
- **Registered worker accounts:** Retained until you delete your account or the prototype environment is reset.

## 4. Deleting Your Account & Data
- Signed-in workers and demo visitors can permanently delete their account and all associated rows at any time from **Settings → Delete account** (invoking `public.delete_my_account()`), which deletes your `workers` profile, cascades all owned visits, follow-ups, referrals, and cloned beneficiaries, and removes your `auth.users` entry.
- Local offline drafts stored in browser IndexedDB (`asha-sakhi-offline-v1`) are cleared automatically upon account deletion or **Reset demo**.
