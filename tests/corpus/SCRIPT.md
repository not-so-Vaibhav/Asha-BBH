# ASHA SAKHI — Gnani Voice Evaluation Script (200 Utterances: 80 Regression + 120 Held-Out `test_v2`)

This read-aloud corpus evaluates the real **Gnani Prisma v3.0 STT -> normalisation -> extraction / correction / danger-rule** pipeline across English, Hindi, Marathi, and code-mix.

## Split Integrity & Recording Plan for `test_v2` (Human Held-Out Set)

- **`dev` (40 items) & `test_v1` (40 items):** Seen during Phase 2 / 2B. **Regression sets only** — never used for headline accuracy claims.
- **`test_v2` (120 items, frozen SHA-256: `09c7fe274e5e0bb8aab8080de86cf8c8d8dd14a4b19e5d1c896d3c30c1482e1c`):** Completely unseen held-out human-speech evaluation set (**33 normal visits**, **33 danger-sign cases across all 7 rules and all languages**, **30 corrections across all 5 fields**, **24 negation/near-miss/ambiguous cases**). Every headline metric denominator is ≥ 30 (and 24+ negations + 33 normal = 51 quiet utterances for false-alert rate).
- **Speaker requirement:** Record with **at least 2 human speakers** (at least one female speaker if possible). Alternate `speaker-1` (60 items) and `speaker-2` (60 items) as listed in the `test_v2` tables below.
- **Noise requirement:** At least half (60/120) must be recorded with background noise — **60 `clean` (50%)**, **30 `household` (25%)**, **30 `street` (25%)**.

## How to Record Audio (Human Recording Instructions)

1. **Audio format (matching Gnani Prisma v3.0 docs):**
   - Container: **WAV** (`.wav`), uncompressed PCM
   - Encoding: **16-bit signed little-endian (`pcm_s16le`)**
   - Channels: **Mono (1 channel)**
   - Sample rate: **16,000 Hz (16 kHz)**
2. **Where to save & file naming:**
   - Place human recordings in `tests/corpus/audio/` using the exact ID from the tables below, e.g.:
     `tests/corpus/audio/V2-NORM-01.wav`, `tests/corpus/audio/V2-DANG-01.wav`, `tests/corpus/audio/V2-NEG-01.wav`, `tests/corpus/audio/V2-CORR-01.wav`.
3. **Converting phone Voice Memos / QuickTime recordings to exact WAV format:**
   ```sh
   ffmpeg -i raw_recording.m4a -ac 1 -ar 16000 -sample_fmt s16 tests/corpus/audio/V2-NORM-01.wav
   ```
   Batch convert a folder of `.m4a` files:
   ```sh
   mkdir -p tests/corpus/audio
   for f in raw/*.m4a; do base=$(basename "$f" .m4a); ffmpeg -y -i "$f" -ac 1 -ar 16000 -sample_fmt s16 "tests/corpus/audio/${base}.wav"; done
   ```
4. **How to add background noise (`noiseLevel` column):**
   - **`clean`**: Quiet room, phone/mic 15–25 cm from mouth, normal speaking pace with 0.5 s silence before and after.
   - **`household`**: Play a realistic household ambiance track (ceiling fan, distant kitchen/TV chatter) from a second phone/speaker ~1 m away at ~50–55 dB while speaking naturally.
   - **`street`**: Play an Indian street/traffic ambiance track (auto-rickshaw/traffic hum) from a second speaker ~1 m away at ~58–62 dB while holding the recording phone at normal field distance (~20 cm).
   - Keep the noise speaker **behind or beside** the microphone (not blasting directly into the capsule) to mirror field visits.
5. **Run the human held-out evaluation once `test_v2` recordings are placed in `tests/corpus/audio/`:**
   ```sh
   npm run gnani:eval -- --split test_v2
   npm run metrics
   ```
   Against a deployed Vercel URL:
   ```sh
   npm run gnani:eval -- --split test_v2 --base-url https://your-deployment.vercel.app
   ```

---

# Part A — Frozen Held-Out Human Evaluation Set: `test_v2` (120 Utterances)

## A1. `test_v2` Normal Visits (33 utterances: 11 EN/mix, 11 HI, 11 MR)

| ID | File | Lang | Noise | Speaker | Beneficiary | Script to read aloud | Expected fields |
|---|---|---|---|---|---|---|---|
| V2-NORM-01 | `V2-NORM-01.wav` | en | clean | speaker-1 | BEN-1001 (Pregnant) | Beneficiary BEN-1001 Sunita Patil ANC visit completed. Weight 56 kg. Vaccinations due TT1. Next visit 21 November. | ID=BEN-1001, Type=ANC, Wt=56 kg, Vax=TT1, Next=2026-11-21 |
| V2-NORM-02 | `V2-NORM-02.wav` | en | household | speaker-2 | BEN-1002 (Newborn) | BEN-1002 HBNC home check done. Weight is 3.3 kg. Vaccinations due BCG and OPV. Next visit 17 November. | ID=BEN-1002, Type=HBNC, Wt=3.3 kg, Vax=BCG and OPV, Next=2026-11-17 |
| V2-NORM-03 | `V2-NORM-03.wav` | en | clean | speaker-1 | BEN-1003 (Child) | BEN-1003 HBYC visit. Weight 9.4 kg. Vaccinations due Pentavalent. Next visit 26 November. | ID=BEN-1003, Type=HBYC, Wt=9.4 kg, Vax=Pentavalent, Next=2026-11-26 |
| V2-NORM-04 | `V2-NORM-04.wav` | en | street | speaker-2 | BEN-1004 (Pregnant) | BEN-1004 PNC follow-up done. Weight 53 kg. Vaccinations due none. Next visit 24 November. | ID=BEN-1004, Type=PNC, Wt=53 kg, Vax=None reported, Next=2026-11-24 |
| V2-NORM-05 | `V2-NORM-05.wav` | en | clean | speaker-1 | BEN-1005 (Child) | BEN-1005 Immunisation session. Weight 11.5 kg. Vaccinations due MR. Next visit 29 November. | ID=BEN-1005, Type=Immunisation, Wt=11.5 kg, Vax=MR, Next=2026-11-29 |
| V2-NORM-06 | `V2-NORM-06.wav` | en | household | speaker-2 | BEN-1002 (Newborn) | BEN-1002 HBNC visit. Weight 2.9 kg. Vaccinations due Hepatitis B. Next visit 16 November. | ID=BEN-1002, Type=HBNC, Wt=2.9 kg, Vax=Hepatitis B, Next=2026-11-16 |
| V2-NORM-07 | `V2-NORM-07.wav` | en | clean | speaker-1 | BEN-1001 (Pregnant) | BEN-1001 General checkup. Weight 57 kg. Vaccinations due TT2. Next visit 3 December. | ID=BEN-1001, Type=General, Wt=57 kg, Vax=TT2, Next=2026-12-03 |
| V2-NORM-08 | `V2-NORM-08.wav` | mix | street | speaker-2 | BEN-1003 (Child) | BEN-1003 Rekha ka HBYC visit kiya. Weight 8.8 kg hai. Vaccinations due Measles. Next visit 27 November. | ID=BEN-1003, Type=HBYC, Wt=8.8 kg, Vax=Measles, Next=2026-11-27 |
| V2-NORM-09 | `V2-NORM-09.wav` | mix | clean | speaker-1 | BEN-1004 (Pregnant) | BEN-1004 Meena cha ANC visit zala. Weight 55 kilo aahe. Vaccines none due. Pudhil visit 1 December. | ID=BEN-1004, Type=ANC, Wt=55 kg, Vax=None reported, Next=2026-12-01 |
| V2-NORM-10 | `V2-NORM-10.wav` | en | household | speaker-2 | BEN-1005 (Child) | BEN-1005 General visit done. Weight 12.2 kg. Vaccinations due DPT. Next visit 21/11/2026. | ID=BEN-1005, Type=General, Wt=12.2 kg, Vax=DPT, Next=2026-11-21 |
| V2-NORM-11 | `V2-NORM-11.wav` | mix | clean | speaker-1 | BEN-1001 (Pregnant) | BEN-1001 ANC visit complete. Weight 54.5 kg. Vaccinations due TT1. Next visit day after tomorrow. | ID=BEN-1001, Type=ANC, Wt=54.5 kg, Vax=TT1, Next=2026-11-15 |
| V2-NORM-12 | `V2-NORM-12.wav` | hi | street | speaker-2 | BEN-1001 (Pregnant) | लाभार्थी BEN-1001 सुनीता की ANC मुलाक़ात। वज़न 56 किलो है। देय टीके TT1। अगली मुलाक़ात 21 नवंबर। | ID=BEN-1001, Type=ANC, Wt=56 kg, Vax=TT1, Next=2026-11-21 |
| V2-NORM-13 | `V2-NORM-13.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | लाभार्थी BEN-1002 की HBNC मुलाक़ात। वज़न 3.3 किलो है। देय टीके हेपेटाइटिस बी। अगली मुलाक़ात 17 नवंबर। | ID=BEN-1002, Type=HBNC, Wt=3.3 kg, Vax=Hepatitis B, Next=2026-11-17 |
| V2-NORM-14 | `V2-NORM-14.wav` | hi | household | speaker-2 | BEN-1003 (Child) | BEN-1003 की HBYC मुलाक़ात पूरी हुई। वज़न 9.2 किलो है। देय टीके पेंटावेलेंट। अगली मुलाक़ात 26 नवंबर। | ID=BEN-1003, Type=HBYC, Wt=9.2 kg, Vax=Pentavalent, Next=2026-11-26 |
| V2-NORM-15 | `V2-NORM-15.wav` | hi | clean | speaker-1 | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 की PNC मुलाक़ात। वज़न 52 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात 24 नवंबर। | ID=BEN-1004, Type=PNC, Wt=52 kg, Vax=None reported, Next=2026-11-24 |
| V2-NORM-16 | `V2-NORM-16.wav` | hi | street | speaker-2 | BEN-1005 (Child) | BEN-1005 टीकाकरण मुलाक़ात। वज़न 11.5 किलो है। देय टीके खसरा। अगली मुलाक़ात 29 नवंबर। | ID=BEN-1005, Type=Immunisation, Wt=11.5 kg, Vax=Measles, Next=2026-11-29 |
| V2-NORM-17 | `V2-NORM-17.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | लाभार्थी BEN-1002 HBNC मुलाक़ात। वज़न 3.5 किलो है। देय टीके बीसीजी। अगली मुलाक़ात 18 नवंबर। | ID=BEN-1002, Type=HBNC, Wt=3.5 kg, Vax=BCG, Next=2026-11-18 |
| V2-NORM-18 | `V2-NORM-18.wav` | hi | household | speaker-2 | BEN-1001 (Pregnant) | BEN-1001 सामान्य मुलाक़ात। वज़न 58 किलो है। देय टीके TT2। अगली मुलाक़ात 4 दिसंबर। | ID=BEN-1001, Type=General, Wt=58 kg, Vax=TT2, Next=2026-12-04 |
| V2-NORM-19 | `V2-NORM-19.wav` | hi | clean | speaker-1 | BEN-1003 (Child) | BEN-1003 टीकाकरण मुलाक़ात। वज़न 10 किलो है। देय टीके पोलियो और डीपीटी। अगली मुलाक़ात 28 नवंबर। | ID=BEN-1003, Type=Immunisation, Wt=10 kg, Vax=OPV and DPT, Next=2026-11-28 |
| V2-NORM-20 | `V2-NORM-20.wav` | hi | street | speaker-2 | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 ANC मुलाक़ात। वज़न 54 किलो है। टीके कोई नहीं। अगली मुलाक़ात परसों। | ID=BEN-1004, Type=ANC, Wt=54 kg, Vax=None reported, Next=2026-11-15 |
| V2-NORM-21 | `V2-NORM-21.wav` | hi | clean | speaker-1 | BEN-1005 (Child) | BEN-1005 सामान्य मुलाक़ात। वज़न 12 किलो है। देय टीके एमआर। अगली मुलाक़ात 1 दिसंबर। | ID=BEN-1005, Type=General, Wt=12 kg, Vax=MR, Next=2026-12-01 |
| V2-NORM-22 | `V2-NORM-22.wav` | hi | household | speaker-2 | BEN-1001 (Pregnant) | BEN-1001 ANC मुलाक़ात। वज़न 55.5 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात कल। | ID=BEN-1001, Type=ANC, Wt=55.5 kg, Vax=None reported, Next=2026-11-14 |
| V2-NORM-23 | `V2-NORM-23.wav` | mr | clean | speaker-1 | BEN-1001 (Pregnant) | लाभार्थी BEN-1001 सुनीता पाटील यांची ANC भेट. वजन 56 किलो आहे. देय लसी TT1. पुढील भेट 21 नोव्हेंबर. | ID=BEN-1001, Type=ANC, Wt=56 kg, Vax=TT1, Next=2026-11-21 |
| V2-NORM-24 | `V2-NORM-24.wav` | mr | street | speaker-2 | BEN-1002 (Newborn) | लाभार्थी BEN-1002 साठी HBNC भेट. वजन 3.3 किलो आहे. देय लसी हेपॅटायटिस बी. पुढील भेट 17 नोव्हेंबर. | ID=BEN-1002, Type=HBNC, Wt=3.3 kg, Vax=Hepatitis B, Next=2026-11-17 |
| V2-NORM-25 | `V2-NORM-25.wav` | mr | clean | speaker-1 | BEN-1003 (Child) | BEN-1003 रेखा जाधव यांची HBYC भेट. वजन 9.2 किलो आहे. देय लसी पेंटाव्हॅलेंट. पुढील भेट 26 नोव्हेंबर. | ID=BEN-1003, Type=HBYC, Wt=9.2 kg, Vax=Pentavalent, Next=2026-11-26 |
| V2-NORM-26 | `V2-NORM-26.wav` | mr | household | speaker-2 | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 मीना पवार यांची PNC भेट. वजन 52 किलो आहे. लस काही नाही. पुढील भेट 24 नोव्हेंबर. | ID=BEN-1004, Type=PNC, Wt=52 kg, Vax=None reported, Next=2026-11-24 |
| V2-NORM-27 | `V2-NORM-27.wav` | mr | clean | speaker-1 | BEN-1005 (Child) | BEN-1005 लसीकरण भेट. वजन 11.5 किलो आहे. देय लसी गोवर. पुढील भेट 29 नोव्हेंबर. | ID=BEN-1005, Type=Immunisation, Wt=11.5 kg, Vax=Measles, Next=2026-11-29 |
| V2-NORM-28 | `V2-NORM-28.wav` | mr | street | speaker-2 | BEN-1002 (Newborn) | लाभार्थी BEN-1002 HBNC भेट. वजन 3.4 किलो आहे. देय लसी बीसीजी. पुढील भेट 19 नोव्हेंबर. | ID=BEN-1002, Type=HBNC, Wt=3.4 kg, Vax=BCG, Next=2026-11-19 |
| V2-NORM-29 | `V2-NORM-29.wav` | mr | clean | speaker-1 | BEN-1001 (Pregnant) | BEN-1001 सामान्य भेट. वजन 57 किलो आहे. देय लसी TT2. पुढील भेट 4 डिसेंबर. | ID=BEN-1001, Type=General, Wt=57 kg, Vax=TT2, Next=2026-12-04 |
| V2-NORM-30 | `V2-NORM-30.wav` | mr | household | speaker-2 | BEN-1003 (Child) | BEN-1003 लसीकरण भेट. वजन 10 किलो आहे. देय लसी पोलिओ आणि डीपीटी. पुढील भेट 27 नोव्हेंबर. | ID=BEN-1003, Type=Immunisation, Wt=10 kg, Vax=OPV and DPT, Next=2026-11-27 |
| V2-NORM-31 | `V2-NORM-31.wav` | mr | clean | speaker-1 | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 ANC भेट. वजन 53.5 किलो आहे. लस काही नाही. पुढील भेट परवा. | ID=BEN-1004, Type=ANC, Wt=53.5 kg, Vax=None reported, Next=2026-11-15 |
| V2-NORM-32 | `V2-NORM-32.wav` | mr | street | speaker-2 | BEN-1005 (Child) | BEN-1005 सामान्य भेट. वजन 12 किलो आहे. देय लसी एमआर. पुढील भेट 1 डिसेंबर. | ID=BEN-1005, Type=General, Wt=12 kg, Vax=MR, Next=2026-12-01 |
| V2-NORM-33 | `V2-NORM-33.wav` | mr | clean | speaker-1 | BEN-1001 (Pregnant) | BEN-1001 ANC भेट पूर्ण झाली. वजन 55 किलो आहे. लस काही नाही. पुढील भेट उद्या. | ID=BEN-1001, Type=ANC, Wt=55 kg, Vax=None reported, Next=2026-11-14 |

## A2. `test_v2` Danger-Sign Utterances (33 utterances: all 7 rules across EN, HI, MR, code-mix)

| ID | File | Lang | Noise | Speaker | Beneficiary | Script to read aloud | Expected rules |
|---|---|---|---|---|---|---|---|
| V2-DANG-01 | `V2-DANG-01.wav` | en | household | speaker-2 | BEN-1001 (Pregnant) | Sunita reports heavy vaginal bleeding since last night. | PREG-01 |
| V2-DANG-02 | `V2-DANG-02.wav` | hi | clean | speaker-1 | BEN-1004 (Pregnant) | मीना को कल रात से खून बह रहा है। | PREG-01 |
| V2-DANG-03 | `V2-DANG-03.wav` | mr | street | speaker-2 | BEN-1001 (Pregnant) | सुनीताला आज सकाळी रक्त जात आहे. | PREG-01 |
| V2-DANG-04 | `V2-DANG-04.wav` | mix | clean | speaker-1 | BEN-1004 (Pregnant) | Meena ko subah se khoon aa raha hai, bleeding aahe. | PREG-01 |
| V2-DANG-05 | `V2-DANG-05.wav` | en | household | speaker-2 | BEN-1004 (Pregnant) | Pregnant mother has spotting with blood today. | PREG-01 |
| V2-DANG-06 | `V2-DANG-06.wav` | en | clean | speaker-1 | BEN-1001 (Pregnant) | Pregnant woman has severe fever with chills. | PREG-02 |
| V2-DANG-07 | `V2-DANG-07.wav` | hi | street | speaker-2 | BEN-1001 (Pregnant) | गर्भवती को रात से ज्यादा बुखार है। | PREG-02 |
| V2-DANG-08 | `V2-DANG-08.wav` | mr | clean | speaker-1 | BEN-1004 (Pregnant) | गर्भवती महिलेला तीव्र ताप आला आहे. | PREG-02 |
| V2-DANG-09 | `V2-DANG-09.wav` | mix | household | speaker-2 | BEN-1001 (Pregnant) | Sunita ko tez bukhar hai aaj. | PREG-02 |
| V2-DANG-10 | `V2-DANG-10.wav` | en | clean | speaker-1 | BEN-1004 (Pregnant) | Mother has very high temperature since evening. | PREG-02 |
| V2-DANG-11 | `V2-DANG-11.wav` | en | street | speaker-2 | BEN-1002 (Newborn) | Newborn body is hot and baby has fever. | NB-01 |
| V2-DANG-12 | `V2-DANG-12.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | नवजात बच्चे का बदन गर्म है और बुखार है। | NB-01 |
| V2-DANG-13 | `V2-DANG-13.wav` | mr | household | speaker-2 | BEN-1002 (Newborn) | नवजात बाळाचे शरीर गरम लागते आणि ताप आहे. | NB-01 |
| V2-DANG-14 | `V2-DANG-14.wav` | mix | clean | speaker-1 | BEN-1002 (Newborn) | Baby ka ang garam hai, fever aahe. | NB-01 |
| V2-DANG-15 | `V2-DANG-15.wav` | hi | street | speaker-2 | BEN-1002 (Newborn) | शिशु छूने पर गर्म लग रहा है। | NB-01 |
| V2-DANG-16 | `V2-DANG-16.wav` | en | clean | speaker-1 | BEN-1002 (Newborn) | Newborn body is cold and feels cold to touch. | NB-02 |
| V2-DANG-17 | `V2-DANG-17.wav` | hi | household | speaker-2 | BEN-1002 (Newborn) | नवजात बच्चे का शरीर ठंडा पड़ गया है। | NB-02 |
| V2-DANG-18 | `V2-DANG-18.wav` | mr | clean | speaker-1 | BEN-1002 (Newborn) | नवजात बाळाचे शरीर थंड लागते. | NB-02 |
| V2-DANG-19 | `V2-DANG-19.wav` | mix | street | speaker-2 | BEN-1002 (Newborn) | Baby cha ang thand aahe, cold to touch. | NB-02 |
| V2-DANG-20 | `V2-DANG-20.wav` | en | clean | speaker-1 | BEN-1002 (Newborn) | Newborn is unable to feed and not taking milk. | NB-03 |
| V2-DANG-21 | `V2-DANG-21.wav` | hi | household | speaker-2 | BEN-1002 (Newborn) | नवजात शिशु स्तनपान नहीं कर रहा है। | NB-03 |
| V2-DANG-22 | `V2-DANG-22.wav` | mr | clean | speaker-1 | BEN-1002 (Newborn) | बाळ सकाळपासून दूध घेत नाही. | NB-03 |
| V2-DANG-23 | `V2-DANG-23.wav` | mix | street | speaker-2 | BEN-1002 (Newborn) | Newborn doodh nahi pi raha, refusing feed. | NB-03 |
| V2-DANG-24 | `V2-DANG-24.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | बच्ची रात से दूध नहीं पी रही है। | NB-03 |
| V2-DANG-25 | `V2-DANG-25.wav` | en | household | speaker-2 | BEN-1002 (Newborn) | Newborn has rapid breathing and chest indrawing. | NB-04 |
| V2-DANG-26 | `V2-DANG-26.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | नवजात बच्चे को सांस लेने में तकलीफ है। | NB-04 |
| V2-DANG-27 | `V2-DANG-27.wav` | mr | street | speaker-2 | BEN-1002 (Newborn) | बाळाला श्वास घेण्यास त्रास आणि दम लागणे आहे. | NB-04 |
| V2-DANG-28 | `V2-DANG-28.wav` | mix | clean | speaker-1 | BEN-1002 (Newborn) | Baby ko tez saans aa rahi hai, fast breathing. | NB-04 |
| V2-DANG-29 | `V2-DANG-29.wav` | hi | household | speaker-2 | BEN-1002 (Newborn) | नवजात शिशु की सांस फूल रही है। | NB-04 |
| V2-DANG-30 | `V2-DANG-30.wav` | en | clean | speaker-1 | BEN-1002 (Newborn) | Newborn is lethargic and had convulsions today. | NB-05 |
| V2-DANG-31 | `V2-DANG-31.wav` | hi | street | speaker-2 | BEN-1002 (Newborn) | नवजात बच्चा सुस्त है और पीले तलवे दिख रहे हैं। | NB-05 |
| V2-DANG-32 | `V2-DANG-32.wav` | mr | clean | speaker-1 | BEN-1002 (Newborn) | बाळ निस्तेज आहे आणि झटके येत आहेत. | NB-05 |
| V2-DANG-33 | `V2-DANG-33.wav` | mix | household | speaker-2 | BEN-1002 (Newborn) | Baby ka cry weak cry hai aur daure aa rahe hain. | NB-05 |

## A3. `test_v2` Negation, Near-Miss, and Recall-First Ambiguous Utterances (24 utterances)

| ID | File | Lang | Noise | Speaker | Beneficiary | Script to read aloud | Expected alert / review |
|---|---|---|---|---|---|---|---|
| V2-NEG-01 | `V2-NEG-01.wav` | en | clean | speaker-1 | BEN-1001 (Pregnant) | No signs of bleeding and no high fever today. | None (quiet) |
| V2-NEG-02 | `V2-NEG-02.wav` | en | street | speaker-2 | BEN-1002 (Newborn) | No fever, baby is feeding normally and active. | None (quiet) |
| V2-NEG-03 | `V2-NEG-03.wav` | en | clean | speaker-1 | BEN-1002 (Newborn) | Without cold to touch and without fast breathing. | None (quiet) |
| V2-NEG-04 | `V2-NEG-04.wav` | en | household | speaker-2 | BEN-1004 (Pregnant) | Mother had high fever three days ago, now fine and eating well. | None (quiet) |
| V2-NEG-05 | `V2-NEG-05.wav` | en | clean | speaker-1 | BEN-1003 (Child) | Older child has fever and cold today. | None (quiet) |
| V2-NEG-06 | `V2-NEG-06.wav` | mix | street | speaker-2 | BEN-1001 (Pregnant) | Meena ko bleeding nahi hai, sab theek hai. | None (quiet) |
| V2-NEG-07 | `V2-NEG-07.wav` | hi | clean | speaker-1 | BEN-1001 (Pregnant) | गर्भवती को खून आना नहीं है और बुखार नहीं है। | None (quiet) |
| V2-NEG-08 | `V2-NEG-08.wav` | hi | household | speaker-2 | BEN-1002 (Newborn) | नवजात बच्चे को बुखार नहीं है और ठंडा नहीं है। | None (quiet) |
| V2-NEG-09 | `V2-NEG-09.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | बच्चे को तेज सांस नहीं है और दौरे नहीं हैं। | None (quiet) |
| V2-NEG-10 | `V2-NEG-10.wav` | hi | street | speaker-2 | BEN-1001 (Pregnant) | पहले तेज बुखार था अब सामान्य है। | None (quiet) |
| V2-NEG-11 | `V2-NEG-11.wav` | hi | clean | speaker-1 | BEN-1002 (Newborn) | नवजात को कोई झटके नहीं और सुस्त नहीं है। | None (quiet) |
| V2-NEG-12 | `V2-NEG-12.wav` | hi | household | speaker-2 | BEN-1003 (Child) | बड़े बच्चे को बुखार है लेकिन नवजात नहीं है। | None (quiet) |
| V2-NEG-13 | `V2-NEG-13.wav` | mr | clean | speaker-1 | BEN-1004 (Pregnant) | मीनाला रक्तस्राव नाही आणि खूप ताप नाही. | None (quiet) |
| V2-NEG-14 | `V2-NEG-14.wav` | mr | street | speaker-2 | BEN-1002 (Newborn) | नवजात बाळाला ताप नाही आणि अंग थंड नाही. | None (quiet) |
| V2-NEG-15 | `V2-NEG-15.wav` | mr | clean | speaker-1 | BEN-1002 (Newborn) | बाळाला जलद श्वास नाही आणि आकडी नाही. | None (quiet) |
| V2-NEG-16 | `V2-NEG-16.wav` | mr | household | speaker-2 | BEN-1001 (Pregnant) | गर्भवतीला आधी जास्त ताप होता आता ठीक आहे. | None (quiet) |
| V2-NEG-17 | `V2-NEG-17.wav` | mr | clean | speaker-1 | BEN-1002 (Newborn) | बाळाला झटके नाहीत आणि निस्तेज नाही. | None (quiet) |
| V2-NEG-18 | `V2-NEG-18.wav` | mr | street | speaker-2 | BEN-1003 (Child) | मोठ्या मुलाला ताप आहे पण ते नवजात नाही. | None (quiet) |
| V2-NEG-19 | `V2-NEG-19.wav` | en | clean | speaker-1 | BEN-1001 (Pregnant) | Possibly high fever, mother is not sure. | PREG-02 (needsReview=true) |
| V2-NEG-20 | `V2-NEG-20.wav` | en | household | speaker-2 | BEN-1002 (Newborn) | Not sure if newborn has fast breathing. | NB-04 (needsReview=true) |
| V2-NEG-21 | `V2-NEG-21.wav` | hi | clean | speaker-1 | BEN-1004 (Pregnant) | शायद गर्भवती को तेज बुखार है, पता नहीं। | PREG-02 (needsReview=true) |
| V2-NEG-22 | `V2-NEG-22.wav` | hi | street | speaker-2 | BEN-1002 (Newborn) | शायद बच्चे को बुखार है। | NB-01 (needsReview=true) |
| V2-NEG-23 | `V2-NEG-23.wav` | mr | clean | speaker-1 | BEN-1001 (Pregnant) | कदाचित गर्भवतीला जास्त ताप आहे. | PREG-02 (needsReview=true) |
| V2-NEG-24 | `V2-NEG-24.wav` | mr | household | speaker-2 | BEN-1002 (Newborn) | कदाचित बाळ दूध पीत नाही, नक्की नाही. | NB-03 (needsReview=true) |

## A4. `test_v2` Voice Corrections (30 utterances: 6 per field across EN, HI, MR)

Base fields for every correction: `BEN-1001`, `ANC`, `55 kg`, `None reported`, `2026-11-20`.

| ID | File | Lang | Noise | Speaker | Script to read aloud | Expected field change |
|---|---|---|---|---|---|---|
| V2-CORR-01 | `V2-CORR-01.wav` | en | clean | speaker-1 | No, weight is 58.5 kg. | `weight`: 55 kg → 58.5 kg |
| V2-CORR-02 | `V2-CORR-02.wav` | en | street | speaker-2 | Weight is sixty two kilo. | `weight`: 55 kg → 62 kg |
| V2-CORR-03 | `V2-CORR-03.wav` | hi | clean | speaker-1 | वज़न उनसठ किलो है। | `weight`: 55 kg → 59 kg |
| V2-CORR-04 | `V2-CORR-04.wav` | hi | household | speaker-2 | नहीं, वज़न 54.5 किलो है। | `weight`: 55 kg → 54.5 kg |
| V2-CORR-05 | `V2-CORR-05.wav` | mr | clean | speaker-1 | नाही, वजन सत्तावन्न किलो आहे. | `weight`: 55 kg → 57 kg |
| V2-CORR-06 | `V2-CORR-06.wav` | mr | street | speaker-2 | वजन 53.5 किलो करा. | `weight`: 55 kg → 53.5 kg |
| V2-CORR-07 | `V2-CORR-07.wav` | en | clean | speaker-1 | Next visit date will be 21 November. | `nextVisitDate`: 2026-11-20 → 2026-11-21 |
| V2-CORR-08 | `V2-CORR-08.wav` | en | household | speaker-2 | Next visit twenty-four eleven twenty twenty-six. | `nextVisitDate`: 2026-11-20 → 2026-11-24 |
| V2-CORR-09 | `V2-CORR-09.wav` | hi | clean | speaker-1 | अगली मुलाक़ात 28 नवंबर। | `nextVisitDate`: 2026-11-20 → 2026-11-28 |
| V2-CORR-10 | `V2-CORR-10.wav` | hi | street | speaker-2 | अगली मुलाक़ात परसों। | `nextVisitDate`: 2026-11-20 → 2026-11-15 |
| V2-CORR-11 | `V2-CORR-11.wav` | mr | clean | speaker-1 | पुढील भेट 27 नोव्हेंबर. | `nextVisitDate`: 2026-11-20 → 2026-11-27 |
| V2-CORR-12 | `V2-CORR-12.wav` | mr | household | speaker-2 | पुढील भेट उद्या. | `nextVisitDate`: 2026-11-20 → 2026-11-14 |
| V2-CORR-13 | `V2-CORR-13.wav` | en | clean | speaker-1 | Vaccinations due: Hepatitis B. | `vaccinationsDue`: None reported → Hepatitis B |
| V2-CORR-14 | `V2-CORR-14.wav` | en | street | speaker-2 | Vaccinations due: Pentavalent and OPV. | `vaccinationsDue`: None reported → Pentavalent and OPV |
| V2-CORR-15 | `V2-CORR-15.wav` | hi | clean | speaker-1 | देय टीके पेंटावेलेंट। | `vaccinationsDue`: None reported → Pentavalent |
| V2-CORR-16 | `V2-CORR-16.wav` | hi | household | speaker-2 | देय टीके खसरा। | `vaccinationsDue`: None reported → Measles |
| V2-CORR-17 | `V2-CORR-17.wav` | mr | clean | speaker-1 | देय लसी गोवर. | `vaccinationsDue`: None reported → Measles |
| V2-CORR-18 | `V2-CORR-18.wav` | mr | street | speaker-2 | देय लसी टीटी दोन. | `vaccinationsDue`: None reported → TT2 |
| V2-CORR-19 | `V2-CORR-19.wav` | en | clean | speaker-1 | Visit type is HBYC. | `visitType`: ANC → HBYC |
| V2-CORR-20 | `V2-CORR-20.wav` | en | household | speaker-2 | Change visit type to General. | `visitType`: ANC → General |
| V2-CORR-21 | `V2-CORR-21.wav` | hi | clean | speaker-1 | मुलाक़ात का प्रकार PNC। | `visitType`: ANC → PNC |
| V2-CORR-22 | `V2-CORR-22.wav` | hi | street | speaker-2 | मुलाक़ात का प्रकार सामान्य। | `visitType`: ANC → General |
| V2-CORR-23 | `V2-CORR-23.wav` | mr | clean | speaker-1 | भेटीचा प्रकार लसीकरण. | `visitType`: ANC → Immunisation |
| V2-CORR-24 | `V2-CORR-24.wav` | mr | household | speaker-2 | भेटीचा प्रकार HBNC. | `visitType`: ANC → HBNC |
| V2-CORR-25 | `V2-CORR-25.wav` | en | clean | speaker-1 | Beneficiary ID is BEN-1003. | `beneficiaryId`: BEN-1001 → BEN-1003 |
| V2-CORR-26 | `V2-CORR-26.wav` | en | street | speaker-2 | Change beneficiary ID to BEN-1005. | `beneficiaryId`: BEN-1001 → BEN-1005 |
| V2-CORR-27 | `V2-CORR-27.wav` | hi | clean | speaker-1 | लाभार्थी ID BEN-1002 है। | `beneficiaryId`: BEN-1001 → BEN-1002 |
| V2-CORR-28 | `V2-CORR-28.wav` | hi | household | speaker-2 | लाभार्थी आईडी BEN-1004 है। | `beneficiaryId`: BEN-1001 → BEN-1004 |
| V2-CORR-29 | `V2-CORR-29.wav` | mr | clean | speaker-1 | लाभार्थी ID BEN-1003 आहे. | `beneficiaryId`: BEN-1001 → BEN-1003 |
| V2-CORR-30 | `V2-CORR-30.wav` | mr | street | speaker-2 | लाभार्थी आयडी BEN-1005 आहे. | `beneficiaryId`: BEN-1001 → BEN-1005 |

---

# Part B — Seen Regression Corpus: `dev` (40) + `test_v1` (40)

## B1. Normal Visits (24 utterances)

| Split | ID | File | Lang | Noise | Beneficiary | Script to read aloud | Expected fields |
|---|---|---|---|---|---|---|---|
| dev | NORM-MR-01 | `NORM-MR-01.wav` | mr | clean | BEN-1001 (Pregnant) | लाभार्थी BEN-1001 सुनीता पाटील. आज ANC भेट घेतली. वजन 55 किलो आहे. लस काही नाही. पुढील भेट 20 नोव्हेंबर. | ID=BEN-1001, Type=ANC, Wt=55 kg, Vax=None reported, Next=2026-11-20 |
| dev | NORM-MR-02 | `NORM-MR-02.wav` | mr | clean | BEN-1002 (Newborn) | लाभार्थी BEN-1002 साठी HBNC भेट. वजन 3.2 किलो आहे. देय लसी BCG. पुढील भेट 18 नोव्हेंबर. | ID=BEN-1002, Type=HBNC, Wt=3.2 kg, Vax=BCG, Next=2026-11-18 |
| dev | NORM-MR-03 | `NORM-MR-03.wav` | mr | household | BEN-1003 (Child) | BEN-1003 रेखा जाधव यांची HBYC भेट. वजन 9 किलो आहे. देय लसी OPV. पुढील भेट 25 नोव्हेंबर. | ID=BEN-1003, Type=HBYC, Wt=9 kg, Vax=OPV, Next=2026-11-25 |
| dev | NORM-MR-04 | `NORM-MR-04.wav` | mr | street | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 मीना पवार. PNC भेट पूर्ण झाली. वजन 52 किलो आहे. पुढील भेट 22 नोव्हेंबर. | ID=BEN-1004, Type=PNC, Wt=52 kg, Vax=None reported, Next=2026-11-22 |
| test_v1 | NORM-MR-05 | `NORM-MR-05.wav` | mr | clean | BEN-1005 (Child) | BEN-1005 आरव कुलकर्णी. लसीकरण भेट. वजन 12 किलो. देय लसी DPT. पुढील भेट 28 नोव्हेंबर. | ID=BEN-1005, Type=Immunisation, Wt=12 kg, Vax=DPT, Next=2026-11-28 |
| test_v1 | NORM-MR-06 | `NORM-MR-06.wav` | mr | household | BEN-1001 (Pregnant) | BEN-1001 सामान्य भेट. वजन 56 किलो आहे. देय लसी TT2. पुढील भेट परवा. | ID=BEN-1001, Type=General, Wt=56 kg, Vax=TT2, Next=2026-11-15 |
| test_v1 | NORM-MR-07 | `NORM-MR-07.wav` | mr | street | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 ANC भेट. वजन 54 किलो आहे. लस काही नाही. पुढील भेट 30 नोव्हेंबर. | ID=BEN-1004, Type=ANC, Wt=54 kg, Vax=None reported, Next=2026-11-30 |
| test_v1 | NORM-MR-08 | `NORM-MR-08.wav` | mr | clean | BEN-1003 (Child) | BEN-1003 साठी सामान्य भेट. वजन 10 किलो आहे. देय लसी Measles. पुढील भेट उद्या. | ID=BEN-1003, Type=General, Wt=10 kg, Vax=Measles, Next=2026-11-14 |
| dev | NORM-HI-01 | `NORM-HI-01.wav` | hi | clean | BEN-1001 (Pregnant) | लाभार्थी BEN-1001 सुनीता पाटिल की ANC मुलाक़ात। वज़न 55 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात 20 नवंबर। | ID=BEN-1001, Type=ANC, Wt=55 kg, Vax=None reported, Next=2026-11-20 |
| dev | NORM-HI-02 | `NORM-HI-02.wav` | hi | clean | BEN-1002 (Newborn) | लाभार्थी BEN-1002 की HBNC मुलाक़ात। वज़न 3.4 किलो है। देय टीके BCG। अगली मुलाक़ात 19 नवंबर। | ID=BEN-1002, Type=HBNC, Wt=3.4 kg, Vax=BCG, Next=2026-11-19 |
| dev | NORM-HI-03 | `NORM-HI-03.wav` | hi | household | BEN-1003 (Child) | BEN-1003 रेखा जाधव की HBYC मुलाक़ात। वज़न 9.5 किलो है। देय टीके OPV। अगली मुलाक़ात 24 नवंबर। | ID=BEN-1003, Type=HBYC, Wt=9.5 kg, Vax=OPV, Next=2026-11-24 |
| test_v1 | NORM-HI-04 | `NORM-HI-04.wav` | hi | street | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 मीना पवार की PNC मुलाक़ात। वज़न 53 किलो है। अगली मुलाक़ात 23 नवंबर। | ID=BEN-1004, Type=PNC, Wt=53 kg, Vax=None reported, Next=2026-11-23 |
| dev | NORM-HI-05 | `NORM-HI-05.wav` | hi | clean | BEN-1005 (Child) | BEN-1005 आरव कुलकर्णी टीकाकरण मुलाक़ात। वज़न 11 किलो है। देय टीके DPT। अगली मुलाक़ात 27 नवंबर। | ID=BEN-1005, Type=Immunisation, Wt=11 kg, Vax=DPT, Next=2026-11-27 |
| test_v1 | NORM-HI-06 | `NORM-HI-06.wav` | hi | household | BEN-1001 (Pregnant) | BEN-1001 सामान्य मुलाक़ात। वज़न 57 किलो है। देय टीके TT1। अगली मुलाक़ात कल। | ID=BEN-1001, Type=General, Wt=57 kg, Vax=TT1, Next=2026-11-14 |
| test_v1 | NORM-HI-07 | `NORM-HI-07.wav` | hi | street | BEN-1004 (Pregnant) | लाभार्थी BEN-1004 ANC मुलाक़ात। वज़न 58 किलो है। देय टीके कुछ नहीं। अगली मुलाक़ात 29 नवंबर। | ID=BEN-1004, Type=ANC, Wt=58 kg, Vax=None reported, Next=2026-11-29 |
| test_v1 | NORM-HI-08 | `NORM-HI-08.wav` | hi | clean | BEN-1005 (Child) | BEN-1005 की सामान्य मुलाक़ात। वज़न 13 किलो है। देय टीके Polio। अगली मुलाक़ात 2 दिसंबर। | ID=BEN-1005, Type=General, Wt=13 kg, Vax=Polio, Next=2026-12-02 |
| dev | NORM-EN-01 | `NORM-EN-01.wav` | mix | clean | BEN-1001 (Pregnant) | BEN-1001 Aaj mi Sunita cha ANC follow-up visit ghetla. Weight 55 kilo aahe. Pudhil visit 20 November la theva. | ID=BEN-1001, Type=ANC, Wt=55 kg, Vax=None reported, Next=2026-11-20 |
| dev | NORM-EN-02 | `NORM-EN-02.wav` | en | clean | BEN-1002 (Newborn) | Beneficiary BEN-1002 HBNC visit. Weight is 3.1 kg. Vaccinations due BCG. Next visit date 18 November. | ID=BEN-1002, Type=HBNC, Wt=3.1 kg, Vax=BCG, Next=2026-11-18 |
| dev | NORM-EN-03 | `NORM-EN-03.wav` | en | household | BEN-1003 (Child) | BEN-1003 HBYC visit completed. Weight is 9 kg. Vaccinations due OPV and DPT. Next visit 25 November. | ID=BEN-1003, Type=HBYC, Wt=9 kg, Vax=OPV and DPT, Next=2026-11-25 |
| dev | NORM-EN-04 | `NORM-EN-04.wav` | en | street | BEN-1004 (Pregnant) | BEN-1004 PNC visit done. Weight 54 kg. Vaccinations due none. Next visit 22 November. | ID=BEN-1004, Type=PNC, Wt=54 kg, Vax=None reported, Next=2026-11-22 |
| test_v1 | NORM-EN-05 | `NORM-EN-05.wav` | en | clean | BEN-1005 (Child) | BEN-1005 Immunisation visit. Weight 12 kg. Vaccinations due Measles. Next visit 28 November. | ID=BEN-1005, Type=Immunisation, Wt=12 kg, Vax=Measles, Next=2026-11-28 |
| test_v1 | NORM-EN-06 | `NORM-EN-06.wav` | mix | household | BEN-1001 (Pregnant) | BEN-1001 Sunita ka ANC visit kiya. Weight 56 kilo hai. Vaccinations due TT2. Next visit tomorrow. | ID=BEN-1001, Type=ANC, Wt=56 kg, Vax=TT2, Next=2026-11-14 |
| test_v1 | NORM-EN-07 | `NORM-EN-07.wav` | en | street | BEN-1003 (Child) | BEN-1003 General visit. Weight is 10 kg. Next visit date 14/11/2026. | ID=BEN-1003, Type=General, Wt=10 kg, Vax=None reported, Next=2026-11-14 |
| test_v1 | NORM-EN-08 | `NORM-EN-08.wav` | mix | clean | BEN-1004 (Pregnant) | BEN-1004 Meena cha PNC visit aahe. Weight 51 kilo. Next visit next Monday. | ID=BEN-1004, Type=PNC, Wt=51 kg, Vax=None reported, Next=2026-11-16 |

## B2. Danger-Sign Utterances (24 utterances)

| Split | ID | File | Lang | Noise | Beneficiary | Script to read aloud | Expected rules |
|---|---|---|---|---|---|---|---|
| dev | DANG-01 | `DANG-01.wav` | en | clean | BEN-1001 (Pregnant) | Pregnant woman has vaginal bleeding since morning. | PREG-01 |
| test_v1 | DANG-02 | `DANG-02.wav` | hi | household | BEN-1001 (Pregnant) | गर्भवती महिला को सुबह से खून आ रहा है। | PREG-01 |
| dev | DANG-03 | `DANG-03.wav` | mr | street | BEN-1004 (Pregnant) | गर्भवतीला सकाळपासून रक्तस्राव होत आहे. | PREG-01 |
| test_v1 | DANG-04 | `DANG-04.wav` | mix | clean | BEN-1001 (Pregnant) | Pregnant woman la bleeding hot aahe. | PREG-01 |
| dev | DANG-05 | `DANG-05.wav` | en | clean | BEN-1001 (Pregnant) | Mother has high fever and body ache today. | PREG-02 |
| dev | DANG-06 | `DANG-06.wav` | hi | street | BEN-1004 (Pregnant) | गर्भवती महिला को बहुत तेज बुखार है। | PREG-02 |
| test_v1 | DANG-07 | `DANG-07.wav` | mr | household | BEN-1001 (Pregnant) | गर्भवतीला खूप ताप आला आहे. | PREG-02 |
| test_v1 | DANG-08 | `DANG-08.wav` | mix | clean | BEN-1004 (Pregnant) | Sunita la khup tap aala aahe, high fever. | PREG-02 |
| dev | DANG-09 | `DANG-09.wav` | en | clean | BEN-1002 (Newborn) | Newborn baby feels hot to touch and has fever. | NB-01 |
| dev | DANG-10 | `DANG-10.wav` | hi | household | BEN-1002 (Newborn) | नवजात शिशु को बुखार है और शरीर गर्म है। | NB-01 |
| test_v1 | DANG-11 | `DANG-11.wav` | mr | street | BEN-1002 (Newborn) | नवजात बाळाला ताप आहे आणि अंग गरम आहे. | NB-01 |
| test_v1 | DANG-12 | `DANG-12.wav` | en | clean | BEN-1002 (Newborn) | Newborn baby feels cold to touch. | NB-02 |
| dev | DANG-13 | `DANG-13.wav` | hi | household | BEN-1002 (Newborn) | नवजात बच्चा छूने पर ठंडा लग रहा है। | NB-02 |
| test_v1 | DANG-14 | `DANG-14.wav` | mr | street | BEN-1002 (Newborn) | बाळाचे अंग थंड पडले आहे. | NB-02 |
| test_v1 | DANG-15 | `DANG-15.wav` | en | clean | BEN-1002 (Newborn) | Baby is not feeding and refuses feed since night. | NB-03 |
| dev | DANG-16 | `DANG-16.wav` | hi | street | BEN-1002 (Newborn) | नवजात बच्चा सुबह से दूध नहीं पी रहा है। | NB-03 |
| test_v1 | DANG-17 | `DANG-17.wav` | mr | household | BEN-1002 (Newborn) | नवजात बाळ दूध पीत नाही. | NB-03 |
| dev | DANG-18 | `DANG-18.wav` | en | clean | BEN-1002 (Newborn) | Newborn has fast breathing and difficulty breathing. | NB-04 |
| test_v1 | DANG-19 | `DANG-19.wav` | hi | household | BEN-1002 (Newborn) | बच्चे को तेज सांस चल रही है और सांस लेने में कठिनाई है। | NB-04 |
| test_v1 | DANG-20 | `DANG-20.wav` | mr | street | BEN-1002 (Newborn) | बाळाला जलद श्वास आहे आणि श्वास घ्यायला त्रास होतो. | NB-04 |
| dev | DANG-21 | `DANG-21.wav` | en | clean | BEN-1002 (Newborn) | Baby has weak cry and yellow palms and soles. | NB-05 |
| dev | DANG-22 | `DANG-22.wav` | hi | household | BEN-1002 (Newborn) | बच्चे को दौरे आ रहे हैं और पीली हथेलियां हैं। | NB-05 |
| test_v1 | DANG-23 | `DANG-23.wav` | mr | street | BEN-1002 (Newborn) | बाळाला आकडी येते आणि पिवळे तळहात आहेत. | NB-05 |
| dev | DANG-24 | `DANG-24.wav` | mix | clean | BEN-1002 (Newborn) | Baby has high fever and doodh pit nahi. | NB-01, NB-03 |

## B3. Negation, Near-Miss, and Ambiguous Utterances (16 utterances)

| Split | ID | File | Lang | Noise | Beneficiary | Script to read aloud | Expected alert / review |
|---|---|---|---|---|---|---|---|
| dev | NEG-01 | `NEG-01.wav` | en | clean | BEN-1001 (Pregnant) | No bleeding reported during checkup. | None (quiet) |
| dev | NEG-02 | `NEG-02.wav` | mix | clean | BEN-1001 (Pregnant) | Sunita la bleeding nahi aahe. | None (quiet) |
| dev | NEG-03 | `NEG-03.wav` | hi | household | BEN-1001 (Pregnant) | गर्भवती को रक्तस्राव नहीं है और तेज बुखार नहीं है। | None (quiet) |
| test_v1 | NEG-04 | `NEG-04.wav` | mr | street | BEN-1004 (Pregnant) | गर्भवतीला रक्तस्राव नाही आणि जास्त ताप नाही. | None (quiet) |
| dev | NEG-05 | `NEG-05.wav` | en | clean | BEN-1002 (Newborn) | Baby had fever last week, now fine and active. | None (quiet) |
| test_v1 | NEG-06 | `NEG-06.wav` | en | household | BEN-1001 (Pregnant) | Had high fever yesterday, now normal and healthy. | None (quiet) |
| dev | NEG-07 | `NEG-07.wav` | hi | clean | BEN-1002 (Newborn) | बच्चे को पहले बुखार था अब ठीक है। | None (quiet) |
| test_v1 | NEG-08 | `NEG-08.wav` | mr | street | BEN-1002 (Newborn) | बाळाला आधी ताप होता आता बरे आहे. | None (quiet) |
| dev | NEG-09 | `NEG-09.wav` | en | clean | BEN-1002 (Newborn) | No fever, no cold to touch, baby is feeding well. | None (quiet) |
| test_v1 | NEG-10 | `NEG-10.wav` | en | household | BEN-1002 (Newborn) | Without fast breathing and without convulsions. | None (quiet) |
| test_v1 | NEG-11 | `NEG-11.wav` | mix | clean | BEN-1001 (Pregnant) | High fever nahi hai, sab normal hai. | None (quiet) |
| test_v1 | NEG-12 | `NEG-12.wav` | en | clean | BEN-1003 (Child) | Child has fever and not feeding well. | None (quiet) |
| dev | NEG-13 | `NEG-13.wav` | en | clean | BEN-1001 (Pregnant) | Maybe bleeding, family is not sure. | PREG-01 (needsReview=true) |
| dev | NEG-14 | `NEG-14.wav` | hi | household | BEN-1001 (Pregnant) | शायद रक्तस्राव हो रहा है। | PREG-01 (needsReview=true) |
| test_v1 | NEG-15 | `NEG-15.wav` | mr | street | BEN-1004 (Pregnant) | कदाचित रक्तस्राव होत आहे, नक्की नाही. | PREG-01 (needsReview=true) |
| test_v1 | NEG-16 | `NEG-16.wav` | en | clean | BEN-1002 (Newborn) | Unclear if baby has fever, might be warm. | NB-01 (needsReview=true) |

## B4. Voice Corrections (16 utterances)

| Split | ID | File | Lang | Noise | Script to read aloud | Expected field change |
|---|---|---|---|---|---|---|
| dev | CORR-01 | `CORR-01.wav` | en | clean | No, weight is 56 kilo. | `weight`: 55 kg → 56 kg |
| dev | CORR-02 | `CORR-02.wav` | hi | clean | नहीं, वज़न 58 किलो है। | `weight`: 55 kg → 58 kg |
| test_v1 | CORR-03 | `CORR-03.wav` | mr | household | नाही, वजन 54 किलो आहे. | `weight`: 55 kg → 54 kg |
| test_v1 | CORR-04 | `CORR-04.wav` | en | street | Weight is fifty seven kg. | `weight`: 55 kg → 57 kg |
| dev | CORR-05 | `CORR-05.wav` | en | clean | No, next visit is 22 November. | `nextVisitDate`: 2026-11-20 → 2026-11-22 |
| dev | CORR-06 | `CORR-06.wav` | hi | household | अगली मुलाक़ात 25 नवंबर। | `nextVisitDate`: 2026-11-20 → 2026-11-25 |
| test_v1 | CORR-07 | `CORR-07.wav` | mr | street | पुढील भेट 26 नोव्हेंबर. | `nextVisitDate`: 2026-11-20 → 2026-11-26 |
| test_v1 | CORR-08 | `CORR-08.wav` | en | clean | Next visit date tomorrow. | `nextVisitDate`: 2026-11-20 → 2026-11-14 |
| dev | CORR-09 | `CORR-09.wav` | en | clean | Vaccinations due: OPV and DPT. | `vaccinationsDue`: None reported → OPV and DPT |
| dev | CORR-10 | `CORR-10.wav` | hi | household | देय टीके: TT2। | `vaccinationsDue`: None reported → TT2 |
| test_v1 | CORR-11 | `CORR-11.wav` | mr | clean | देय लसी: BCG. | `vaccinationsDue`: None reported → BCG |
| dev | CORR-12 | `CORR-12.wav` | en | clean | Visit type is PNC. | `visitType`: ANC → PNC |
| test_v1 | CORR-13 | `CORR-13.wav` | en | street | Change visit type to HBNC. | `visitType`: ANC → HBNC |
| test_v1 | CORR-14 | `CORR-14.wav` | hi | clean | मुलाक़ात का प्रकार टीकाकरण। | `visitType`: ANC → Immunisation |
| dev | CORR-15 | `CORR-15.wav` | en | clean | Beneficiary ID is BEN-1002. | `beneficiaryId`: BEN-1001 → BEN-1002 |
| test_v1 | CORR-16 | `CORR-16.wav` | mr | household | लाभार्थी ID BEN-1004 आहे. | `beneficiaryId`: BEN-1001 → BEN-1004 |
