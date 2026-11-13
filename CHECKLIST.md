# ASHA SAKHI implementation checklist

Audit date: 2026-11-13. Status reflects the running Vite app plus source/unit-test evidence. Playwright scenarios are authored but browser execution is blocked in this macOS sandbox; see the test note below. `README.md` remains the product source of truth.

## P0: Required by PS1

| Item | Status | Evidence and notes |
|---|---|---|
| P0-1 Voice capture with live streaming transcript (provider label visible) | PARTIAL | `src/voice/gnani.ts` captures microphone PCM16 audio and streams through `server/index.mjs` to official Prisma v3.0; synthetic generated audio completed an authenticated stream and returned a transcript. Browser microphone permission/capture and visible UI transcript were not verified in the browser. Provider selector and label are in `src/screens/App.tsx`. |
| P0-2 Marathi, Hindi, English switch in top bar; UI strings and spoken alert change with it | PARTIAL | Top-bar selector and translated danger wording in `src/screens/App.tsx`, `src/data/i18n.ts`, `src/domain/rules.ts`; Hindi/Marathi UI and alert wording were exercised in the running app. Some sample/demo text and fixed names remain English, so full UI localization is incomplete. Visit steps, correction affordance, transcript heading, and empty referrals text now have en/hi/mr strings; dictionary key parity is tested in `src/data/i18n.test.ts`. |
| P0-3 Structured record with all five fields | DONE | `VisitFields`, `extract`, and Visit field grid in `src/domain/types.ts`, `src/domain/extraction.ts`, `src/screens/App.tsx`; runtime normal flow showed ID, visit type, weight, vaccinations due (“None reported”), and next visit. `src/domain/data.test.ts` extraction test. |
| P0-4 Spoken read-back of the full record before saving | PARTIAL | `recordText` and automatic/replay read-back in `src/screens/App.tsx`; `src/voice/tts.ts` uses Timbre v3.0 via the server proxy, with a labeled browser speech fallback. Timbre returned a valid WAV (230,444 bytes) for synthetic text; playback in the browser was not verified. |
| P0-5 Voice or typed correction of any field; only that field changes | PARTIAL | Typed correction parser `src/domain/correction.ts` and `applyCorrection` in `src/screens/App.tsx`; runtime verified 55→56 kg with other fields unchanged. Unit tests cover weight, date, vaccinations, visit type, and beneficiary ID in `src/domain/data.test.ts`. The Browser speech correction action is now available alongside typed correction; voice capture depends on browser support and microphone permission, so the spoken correction itself remains unverified here. |
| P0-6 Correction history with old value, new value, and time | DONE | `Correction` model and read-back history in `src/domain/types.ts`, `src/domain/correction.ts`, `src/screens/App.tsx`; runtime displayed 55 kg → 56 kg with time. |
| P0-7 Confirm step; nothing saved before confirmation | DONE | `confirmVisit` is the only visit-save path in `src/screens/App.tsx`; runtime stayed on draft/read-back until Confirm & save. |
| P0-8 Follow-up task created from next-visit date | DONE | `saveVisit` in `src/store/useAppStore.ts`; runtime saved 20 November and Follow-ups showed its task. |
| P0-9 Pregnancy and newborn danger rules PREG-01, PREG-02, NB-01 to NB-05; negation and recall-first | DONE | Deterministic rules in `src/domain/rules.ts`; `src/domain/rules.test.ts` covers pregnancy bleeding/fever, both negations, ambiguity, newborn NB-01..05 phrases, newborn scope, and streaming negation. Runtime emergency path fired PREG-01. |
| P0-10 Instant selected-language alert before read-back, vibration, spoken warning | PARTIAL | `referralFor` in `src/screens/App.tsx` stops capture and triggers alert before read-back, calls vibration and localized `say`; actual alert speech playback and device vibration were not verified. Timbre API smoke test succeeded independently. |
| P0-11 Referral record with rule, category, timestamp, sample facility, Pending review | DONE | `Referral` creation in `src/screens/App.tsx`, persistence in `src/store/useAppStore.ts`; runtime PREG-01 alert showed all fields and status. |
| P0-12 Saved visit flagged Danger sign and linked to referral; draft retained after alert | DONE | `confirmVisit`, alert close/map return in `src/screens/App.tsx`; runtime returned from alert to the populated draft, then saved the linked danger flag. |
| P0-13 Alert uses only predefined referral wording; no diagnosis/medicine/dosage | DONE | Rule wording in `src/domain/rules.ts`, alert rendering in `src/screens/App.tsx`; runtime alert used predefined referral text only. |
| P0-14 Visible Synthetic demo data marker | DONE | Header marker in `src/screens/App.tsx`; visible in the running app on Home and other screens. |

## P1: Core demo features

| Item | Status | Evidence and notes |
|---|---|---|
| P1-1 Beneficiary list/search; pregnant, newborn, child seeds; BEN-1001 Sunita | DONE | `src/data/seed.ts`, `BeneficiaryList` and search in `src/screens/App.tsx`; runtime showed seeded beneficiaries and Sunita demo case. |
| P1-2 Visit history on each beneficiary | PARTIAL | History screen and `VisitCard` in `src/screens/App.tsx`; persisted visits are filtered per beneficiary. History expansion was not separately exercised in the running UI. |
| P1-3 ANC, PNC, HBNC, HBYC, Immunisation, General selectable | PARTIAL | `visitTypes` and field selector in `src/screens/App.tsx`; all six options are implemented; individual selection was not exercised in the running UI. |
| P1-4 Follow-ups with Upcoming, Pending, Overdue tabs | PARTIAL | Follow-ups filter/tabs in `src/screens/App.tsx`; visit save creates persisted task in store; each tab filter was not separately exercised in the running UI. |
| P1-5 Dashboard today's visits, follow-ups, overdue, referrals; live updates | DONE | Dashboard counts/progress ring in `src/screens/App.tsx`; runtime visit save changed visit/follow-up totals. |
| P1-6 Referrals list with triggering transcript excerpt | PARTIAL | `ReferralCard` in `src/screens/App.tsx`; referral list renders transcript excerpts; list screen was not separately exercised in the running UI. |

## M: Map

| Item | Status | Evidence and notes |
|---|---|---|
| M-1 Map tab and phone-sized map screen | DONE | Bottom navigation and Map screen in `src/screens/App.tsx`, `src/components/MapView.tsx`; runtime opened map. |
| M-2 District, Block, Village hierarchy chips; multiple sample areas | PARTIAL | `src/data/geo.ts`, map hierarchy in `src/screens/App.tsx`; multiple samples are rendered, but changing districts/villages was not separately exercised in the running UI. |
| M-3 Assigned area outlined; other areas faded | DONE | District-dependent polygon style in `src/components/MapView.tsx`. |
| M-4 Village heatmap and legend | DONE | Coverage polygons and legend in `src/components/MapView.tsx`; runtime map reflected saved visit coverage. |
| M-5 Lowest coverage highlighted Low coverage | DONE | `VillageCoverage` in `src/components/MapView.tsx`. |
| M-6 Synthetic household pins; tap shows beneficiary and status | PARTIAL | Synthetic markers and pin detail/click handlers in `src/components/MapView.tsx`; implemented, but pin interaction was not separately verified at runtime. |
| M-7 Sample PHC marker, distance, Sample facility label | DONE | `facility` in `src/data/geo.ts`; permanent tooltip and alert card in `src/components/MapView.tsx` and `src/screens/App.tsx`; runtime showed label and 1.8 km. |
| M-8 Saving raises coverage; emergency adds red pin | DONE | Coverage and referral marker derive from persisted visits/referrals in `src/components/MapView.tsx`; runtime showed 50% coverage after save and emergency marker after referral. |
| M-9 Village aggregated completed/pending card | PARTIAL | `VillageCoverage` in `src/components/MapView.tsx`; component renders village summaries, but the individual card values were not separately verified at runtime. |
| M-10 Aggregated view · no continuous tracking privacy chip | DONE | Map UI in `src/screens/App.tsx`; visible at runtime. |
| M-11 Show nearest PHC opens map highlighted | DONE | Alert action and facility highlight in `src/screens/App.tsx`; runtime opened map with PHC highlighted. |
| M-12 Sample geography, not real boundaries label | DONE | Map note and disclaimer in `src/screens/App.tsx`; runtime visible. `src/data/geo.ts` contains sample geometry; OSM tile names provide real-world visual context, while app geometry/data remain synthetic. |

## P2: Phase 2 mock screens

| Item | Status | Evidence and notes |
|---|---|---|
| P2-1 Offline banner, draft saved on device | MISSING | Not built; deferred because P0/P1/M prerequisites are not all DONE. |
| P2-2 Dashboard Download CSV | MISSING | Not built; deferred because prerequisites are not all DONE. |
| P2-3 Voice reminder for tomorrow | MISSING | Not built; deferred because prerequisites are not all DONE. |
| P2-4 Duplicate-name same-day warning (optional) | MISSING | Not built; deferred because prerequisites are not all DONE. |

## Verification and remaining work

- `npm run build`: passed after the Gnani provider integration; TypeScript and Vite production build succeeded.
- `npm run test`: Vitest suite passed (29 tests across 4 files, including correction-field and translation-key coverage).
- Gnani API smoke checks: `GET /api/gnani/status` reports configured=true without returning the key. Timbre accepted synthetic text and returned WAV audio. Prisma authenticated the local WebSocket proxy and transcribed generated synthetic PCM16 speech. These verify the upstream credentials/protocol and server proxy, not browser microphone permission or device playback.
- `npm run e2e`: five Playwright scenarios are present in `tests/e2e/acceptance.spec.ts`. Playwright execution was attempted: all five scenarios stopped before assertions when macOS denied Chromium’s `bootstrap_check_in` call (`Permission denied (1100)`), even after installing the Playwright-matched Chromium binary. Browser launch must run outside this restricted sandbox to pass UI assertions. Key normal and emergency flows were manually exercised in the running app; see the individual rows above.
- No Gnani implementation TODO markers remain. Official Prisma and Timbre integrations are implemented using Gnani’s documented API contracts. Remaining verification requires using browser microphone permission and hearing the Timbre read-back on the target device.
- Simulated/stubbed: `SimulatedProvider` remains the default; sample transcripts, beneficiaries, map geometry, facility, distances, and referral data are synthetic; Browser speech is an explicitly labeled fallback, not Gnani; voice correction was added but spoken correction is not device-verified. The alert “Call PHC · demo number” control is display-only and does not place a call. Map uses OSM tiles with an SVG fallback. No government integration, offline speech, or measured accuracy is claimed.
- Out of scope roadmap only: login/authentication, roles, beneficiary registration, supervisor/national dashboards, learning centre, government integration, PostGIS, Celery, Redis.
