# ASHA SAKHI — Measured Gnani Voice Pipeline Metrics

Generated: 2026-11-21T10:36:34.106Z  
Fixture run timestamp: 2026-11-21T09:47:36.079Z  
Target endpoint: `local-server`  
Corpus splits: **40 `dev` (seen tuning)** · **40 `test_v1` (seen regression)** · **120 `test_v2` (frozen unseen human held-out)**

> **Measurement integrity notice:** Headline numbers in Section 1 come **exclusively from human-recorded audio on the frozen held-out `test_v2` split**. All `dev` and `test_v1` numbers below are **seen synthetic baseline regression data (not human speech)** and never claim an unqualified `MET`. Every denominator under 30 is flagged `⚠ n<30`.

---

## 1. Headline Metrics — Frozen Held-Out `test_v2` (Human Audio Only)

**No human-speech result yet.**

- Frozen `test_v2` split: **120 unseen utterances** (33 normal visits, 33 danger signs across all 7 rules & all languages, 30 corrections across all 5 fields, 24 negation/near-miss/ambiguous cases).
- Frozen ID list & SHA-256: `tests/corpus/test_v2_frozen.json` (`09c7fe274e5e0bb8aab8080de86cf8c8d8dd14a4b19e5d1c896d3c30c1482e1c`).
- Recording plan: at least **2 human speakers** (one female if possible), **50% clean (60)** + **25% household (30)** + **25% street (30)** placed in `tests/corpus/audio/` per `tests/corpus/SCRIPT.md`, then run `npm run gnani:eval -- --split test_v2 && npm run metrics`.
- Previous synthetic Phase 2B `test` items are now marked **`test_v1` (seen regression set)** in Section 6 below and are **never** reported as headline metrics.

---

## 2. User-Experienced Latency (End of Speech → User Event, Seen Synthetic Baseline)

End-of-speech (`EoS`) is measured from the last active 32 ms speech frame (RMS > 0.008) in each PCM stream, excluding the speaker’s talking duration. Legacy `first-frame → final` includes full speaking duration.

| Latency stage | Samples | p50 | p95 | Notes |
|---|---|---|---|---|
| **End of speech → final transcript** (Prisma STT) | 40 | 1112 ms | 1396 ms | Includes VAD `x-min-silence-ms=600` + inference + WS RTT |
| **End of speech → danger alert visible** | 12 ⚠ n<30 | 1088 ms | 2657 ms | Fires on first finalized danger segment (<1 ms rule check) |
| **End of speech → alert audio start** (pre-cached WAV) | 12 ⚠ n<30 | 1088 ms | 2657 ms | 0 ms network fetch via preloaded `public/audio/alert-{lang}.wav` |
| **End of speech → read-back audio start** (uncached Timbre) | 40 | 4939 ms | 8686 ms | EoS→transcript + concise Timbre REST WAV; 0 ms on cached/pre-gen |
| *Legacy: first audio frame → final transcript (includes speaking time)* | 65 | 3952 ms | 10920 ms | Includes full utterance duration (3–10 s of speech) |

---

## 3. VAD `x-min-silence-ms` Sweep (`dev` Split Only)

| `x-min-silence-ms` | Samples (`dev`) | EoS → final p50 | EoS → final p95 | Field accuracy | Danger recall | False alerts |
|---|---|---|---|---|---|---|
| 300 ms | 9 ⚠ n<30 | 941 ms | 3823 ms | 86.7% (13/15 ⚠ n<30) | 75.0% (3/4 ⚠ n<30) | 0 |
| 450 ms | 9 ⚠ n<30 | 1010 ms | 3741 ms | 93.3% (14/15 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 0 |
| 600 ms | 9 ⚠ n<30 | 1067 ms | 2309 ms | 100.0% (15/15 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 0 |

---

## 4. Danger-Path Early-Fire Proof (Long Multi-Segment Utterance)

- Segment 1 (danger phrase) speech duration: **2816 ms**
- Combined multi-segment audio duration: **14120 ms**
- End of Segment 1 → danger alert visible: **1134 ms**
- Alert fired before combined audio ended: **YES**
- Lead time before Segment 2 finalized: **11839 ms**
- Waited for read-back or live TTS call: **NO (pre-cached alert WAV)**

---

## 5. Timbre Read-Back Speed Breakdown

| Read-back variant | Samples | Avg chars | Request → first byte p50 | Full audio p50 | Full audio p95 |
|---|---|---|---|---|---|
| Before (verbose wording, REST) | 6 ⚠ n<30 | 123 | 5601 ms | 5604 ms | 8251 ms |
| After (concise wording, REST) | 6 ⚠ n<30 | 71 | 3823 ms | 3827 ms | 7290 ms |
| Pre-generated template / cached replay | — | 71 | 0 ms (0 Timbre calls) | 0 ms | 0 ms |

---

## 6. Seen Regression Sets (`dev` + `test_v1` — Synthetic Baseline, NOT Headline Metrics)

Both `dev` and `test_v1` have been seen and are used strictly for regression testing of general failure-class fixes.

| Metric | `dev` (seen tuning, n=25) | `test_v1` (seen regression, n=40) |
|---|---|---|
| Field extraction accuracy (all 5 fields) | 100.0% (30/30) | 95.0% (57/60) |
| Voice correction success | 100.0% (5/5 ⚠ n<30) | 87.5% (7/8 ⚠ n<30) |
| Danger-sign recall (approved + ambiguous) | 100.0% (12/12 ⚠ n<30) | 100.0% (14/14 ⚠ n<30) |
| False alert rate (negations + normal) | 0.0% (0/9 ⚠ n<30) | 0.0% (0/18 ⚠ n<30) |

### `test_v1` (Seen Regression) Breakdown by Language

| Language | Normal utterances | Beneficiary ID | Visit type | Weight | Vaccinations due | Next visit date |
|---|---|---|---|---|---|---|
| en | 2 | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) |
| hi | 4 | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 50.0% (2/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) |
| mr | 4 | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) |
| mix | 2 | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 50.0% (1/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) |

| Language | Correction success | Danger recall | False alerts |
|---|---|---|---|
| en | 100.0% (3/3 ⚠ n<30) | 100.0% (3/3 ⚠ n<30) | 0.0% (0/5 ⚠ n<30) |
| hi | 100.0% (1/1 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 0.0% (0/4 ⚠ n<30) |
| mr | 75.0% (3/4 ⚠ n<30) | 100.0% (7/7 ⚠ n<30) | 0.0% (0/6 ⚠ n<30) |
| mix | N/A (n=0) | 100.0% (2/2 ⚠ n<30) | 0.0% (0/3 ⚠ n<30) |

### `dev` (Seen Tuning) Breakdown by Language

| Language | Normal utterances | Beneficiary ID | Visit type | Weight | Vaccinations due | Next visit date |
|---|---|---|---|---|---|---|
| en | 1 | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) |
| hi | 2 | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) |
| mr | 2 | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) | 100.0% (2/2 ⚠ n<30) |
| mix | 1 | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) | 100.0% (1/1 ⚠ n<30) |

| Language | Correction success | Danger recall | False alerts |
|---|---|---|---|
| en | 100.0% (4/4 ⚠ n<30) | 100.0% (4/4 ⚠ n<30) | 0.0% (0/3 ⚠ n<30) |
| hi | 100.0% (1/1 ⚠ n<30) | 100.0% (5/5 ⚠ n<30) | 0.0% (0/2 ⚠ n<30) |
| mr | N/A (n=0) | 100.0% (1/1 ⚠ n<30) | 0.0% (0/2 ⚠ n<30) |
| mix | N/A (n=0) | 100.0% (2/2 ⚠ n<30) | 0.0% (0/2 ⚠ n<30) |

---

## 7. Remaining Regression Failures (`dev` + `test_v1`, Seen Synthetic Data)

| Split | ID | Category | Lang | Noise | Field | Expected | Got | Cause | Transcript |
|---|---|---|---|---|---|---|---|---|---|
| test_v1 | NORM-HI-06 | extraction | hi | clean | vaccinationsDue | TT1 | TT | Mismatch between STT transcript and expected vaccinationsDue | वह एक हज़ार एक सामान्य मुलाकात वजन सत्तावन किलो है। देय टीके TT अगली मुलाकात कल। |
| test_v1 | NORM-HI-08 | extraction | hi | clean | vaccinationsDue | Polio | None reported | Mismatch between STT transcript and expected vaccinationsDue | बेन एक हज़ार पाँच की सामान्य मुलाकात वजन तेरह किलो है। अगली मुलाकात दो दिसंबर |
| test_v1 | NORM-EN-06 | extraction | mix | clean | vaccinationsDue | TT2 | TT | Mismatch between STT transcript and expected vaccinationsDue | बेन एक हज़ार एक सुनीता का ANC visit किया, weight छप्पन किलो है, vaccinations due TT बाबू, next visit tomorrow. |
| test_v1 | CORR-11 | correction | mr | clean | vaccinationsDue | BCG | null | Mismatch between STT transcript and expected vaccinationsDue | DLACB CG. |
