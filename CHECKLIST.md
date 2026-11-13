# ASHA SAKHI implementation checklist

Initial runtime audit: 2026-11-13, app served from this project at `http://localhost:5174/` and observed at the phone viewport. The supplied `README.md` is the available scope reference; `asha_sakhi_demo.html` is absent. No `.git` directory existed at audit start, so this repository was initialized for the requested checklist commit.

Statuses describe observed behavior, not just source presence. `PARTIAL` means some visible behavior exists but the acceptance requirement is incomplete. `MISSING` means it was not present in the running app.

## P0: Required by PS1

| ID | Status | Evidence | Notes |
|---|---|---|---|
| P0-1 Voice capture with live streaming transcript (provider label visible) | PARTIAL | `src/screens/App.tsx` Voice Visit; `src/voice/simulated.ts` | Runtime showed `Simulated` and incremental sample transcript; mic does not capture speech and provider selector is not wired. |
| P0-2 Marathi, Hindi, English switch in top bar; UI strings and spoken alert change | PARTIAL | `src/screens/App.tsx` `.lang-switch`; `src/data/i18n.ts`; `src/voice/tts.ts` | Runtime switch exists only on visit screen; most page strings remain English; spoken alert is always Hindi. |
| P0-3 Five structured fields incl. beneficiary ID and vaccinations due | PARTIAL | `src/screens/App.tsx` `Field`; `src/domain/extraction.ts` | Four cards are rendered; beneficiary ID only appears in header, vaccines are always blank; no “none reported” state. |
| P0-4 Spoken read-back of full record before saving | MISSING | `src/screens/App.tsx` `.readback`; `src/voice/tts.ts` | Runtime read-back panel is visual only and omits beneficiary ID and vaccines. |
| P0-5 Voice or typed correction of any field; only named field changes | PARTIAL | `src/domain/correction.ts`; `src/screens/App.tsx` `doCorrection` | Runtime path only recognizes weight correction; correction intent is typed, not voice, and other fields are unsupported. |
| P0-6 Correction history with old/new values and time | MISSING | `src/domain/types.ts`; `src/screens/App.tsx` | No correction history model or record display. |
| P0-7 Confirm step; nothing saved before confirmation | PARTIAL | `src/screens/App.tsx` `readback`/`saved`; `src/store/useAppStore.ts` | Confirm button exists, but saved data is only a visit counter/fields; alert incorrectly increments the counter before confirm. |
| P0-8 Follow-up task automatically created from next-visit date | MISSING | `src/screens/App.tsx` Follow-ups; `src/store/useAppStore.ts` | Follow-ups are hard-coded seed cards; visit save creates no task. |
| P0-9 Pregnancy/newborn rules with negation and recall-first ambiguity | PARTIAL | `src/domain/rules.ts`; `src/domain/rules.test.ts` | Six tests cover a subset. Rule matching is incomplete, no ambiguous `needsReview` result is emitted, and negation coverage is narrow. |
| P0-10 Instant localized alert before read-back, vibration, spoken warning | PARTIAL | `src/screens/App.tsx` `run` and `.alert-overlay`; `src/voice/tts.ts` | Runtime alert interrupt exists; warning text is fixed Hindi, no vibration, no rule review handling. |
| P0-11 Referral record with rule/category/time/facility/status | MISSING | `src/screens/App.tsx` `.referral-card` | Alert shows a static placeholder card; no referral record is persisted or listed. |
| P0-12 Saved visit flagged Danger sign and linked to referral; draft kept | MISSING | `src/screens/App.tsx`; `src/store/useAppStore.ts` | No visit record model or referral link. |
| P0-13 Alert contains only predefined referral wording | PARTIAL | `src/screens/App.tsx` `.alert-content` | Fixed copy is not backed by localized rule wording and the page includes a generic “Seek urgent care now” headline. |
| P0-14 Visible “Synthetic demo data” marker | DONE | `src/screens/App.tsx` header `.demo` | Runtime Home and Visit screens visibly show the marker. |

## P1: Core demo features

| ID | Status | Evidence | Notes |
|---|---|---|---|
| P1-1 Searchable beneficiary list; pregnant/newborn/child seeds incl. BEN-1001 | PARTIAL | `src/data/seed.ts`; `src/screens/App.tsx` `BeneficiaryList` | Runtime list has five required kinds and BEN-1001; no name/ID search. |
| P1-2 Visit history on each beneficiary | MISSING | `src/screens/App.tsx` `People`; `src/store/useAppStore.ts` | No history model or beneficiary detail screen. |
| P1-3 Visit types ANC, PNC, HBNC, HBYC, Immunisation, General | MISSING | `src/domain/extraction.ts`; `src/screens/App.tsx` Voice Visit | Visit type is inferred only as ANC/Normal; no selectable six-type control. |
| P1-4 Follow-ups Upcoming, Pending, Overdue tabs | PARTIAL | `src/screens/App.tsx` Follow-ups | Runtime page has Upcoming/Overdue/Done tabs, not Pending; tabs do not filter. |
| P1-5 Dashboard live counts for visits/follow-ups/overdue/referrals | PARTIAL | `src/screens/App.tsx` Home; `src/store/useAppStore.ts` | Runtime dashboard shows counts, mostly constants; visit count is a counter, referrals/follow-ups do not update from records. |
| P1-6 Referrals screen with records and transcript excerpt | MISSING | `src/screens/App.tsx` Referrals | Runtime screen is an empty state; referrals are not persisted. |

## M: Map (sample data only)

| ID | Status | Evidence | Notes |
|---|---|---|---|
| M-1 Map tab and phone-sized map screen | MISSING | `src/screens/App.tsx` bottom navigation | No Map navigation item or screen. |
| M-2 District/Block/Village hierarchy, sample names | MISSING | No `src/data/geo.ts` | No geography data. |
| M-3 Assigned area outlined; other areas faded | MISSING | No map implementation | — |
| M-4 Village coverage heatmap and legend | MISSING | No map implementation | — |
| M-5 Lowest-coverage village flagged “Low coverage” | MISSING | No map implementation | — |
| M-6 Synthetic household pins with beneficiary/status details | MISSING | No map implementation | — |
| M-7 Sample PHC marker, distance, “Sample facility” label | MISSING | No map implementation | — |
| M-8 Coverage updates after save; emergency red pin | MISSING | No map/visit linkage | — |
| M-9 Village aggregated completed/pending stats | MISSING | No map/aggregate model | — |
| M-10 Privacy chip “Aggregated view · no continuous tracking” | MISSING | No map implementation | — |
| M-11 Alert “Show nearest PHC” opens highlighted map | MISSING | `src/screens/App.tsx` alert actions | No action or map route. |
| M-12 “Sample geography, not real boundaries” label | MISSING | No map implementation | — |

## P2: Phase 2 mock screens (only after P0, P1 and M)

| ID | Status | Evidence | Notes |
|---|---|---|---|
| P2-1 Offline banner with specified copy | MISSING | No offline state in `src/screens/App.tsx` | Not implemented. |
| P2-2 Dashboard Download CSV | MISSING | `src/screens/App.tsx` Home | Not implemented. |
| P2-3 Voice reminder for tomorrow’s visits | MISSING | `src/screens/App.tsx` Home; `src/voice/tts.ts` | No reminder button or generated list. |
| P2-4 Duplicate-name same-day warning (optional) | MISSING | No visit persistence | Not implemented. |

## Runtime audit notes

- `npm run dev` served the Home screen from this directory; the Home page showed the synthetic marker, progress ring, cards and five seeded beneficiaries.
- Opening Sunita’s Voice Visit showed the `Simulated` chip and four empty field cards. Tapping **Normal visit** showed a word-streamed transcript beginning “Aaj mi”; a stable read-back was not observed in the audit session.
- The static source includes a visual read-back sheet, static emergency card, and mock follow-up/referral views; these do not establish persisted records or their required behavior.
- `npm run build` and `npm run test` had passed before this audit. Existing test file: `src/domain/rules.test.ts` (6 tests). There are no Playwright dependencies or e2e tests despite the `e2e` script.

## Out of scope

Do not build login/authentication, roles, beneficiary registration, supervisor or national dashboards, learning centre, government integration, PostGIS, Celery or Redis. Report these as roadmap only.
