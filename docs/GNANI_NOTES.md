# Gnani AI Integration Notes (ASHA SAKHI)

This document records the exact Gnani Prisma v3.0 (STT) and Timbre v3.0 (TTS) parameters in use, where each parameter comes from in the official Gnani documentation, observed live API behavior, and open questions for Gnani staff. We do **not** invent or rely on undocumented parameters.

---

## 1. Prisma v3.0 Realtime Streaming STT

- **Endpoint:** `wss://api.vachana.ai/stt/v3/stream`  
- **Docs:** [Prisma Streaming WebSocket](https://docs.gnani.ai/api/STT/stt-websocket) · [Supported Languages](https://docs.gnani.ai/api/STT/languages)

| Parameter / Setting | Value Used in ASHA SAKHI | Official Gnani Documentation Source |
|---|---|---|
| `x-api-key-id` (upgrade header) | Server-only `process.env.GNANI_API_KEY_ID` | Required authentication header on `/stt/v3/stream` (STT WebSocket docs). |
| `model` (upgrade header) | `prisma-v3.0` | Explicit opt-in to Prisma v3.0 model (default is `prisma-v2.5`). |
| `language_code` (upgrade header) | Single locale per selected UI language: `indic-auto` (EN/code-mix), `hi-IN` (Hindi), `mr-IN` (Marathi) | Supported Languages + WebSocket docs. Live server requires a single locale in `language_code` (see Section 3). |
| `format` (upgrade header) | `codemix` | Output formatting mode preserving native scripts plus embedded English clinical terms (`ANC`, `kg`, `BEN-1001`). |
| `x-sample-rate` (upgrade header) | `16000` | Native 16 kHz PCM16 streaming input rate. |
| Audio encoding & chunking | Raw 16-bit signed linear PCM, mono (1 ch), **exact 1,024-byte frames** (512 samples) every **32 ms** | Streaming chunking spec: 1,024-byte frames at 32 ms cadence for 16 kHz audio; no buffering/bursting. |
| `x-vad-threshold` (upgrade header) | `0.5` | Documented range `0.0–1.0` (clean mics `0.45–0.55`; telephony `0.65–0.75`). |
| `x-min-silence-ms` (upgrade header) | `600` (default; evaluated on `dev` at `300`, `450`, `600` ms — `600` ms kept because `300` ms missed a danger sign `3/4` and had higher p95 `3,823 ms` vs `600` ms's `2,309 ms` p95, `15/15` fields, `4/4` danger) | Documented range `100–2000` ms (telephony `400–600 ms`, conversational `600–900 ms`). |
| `x-idle-timeout-sec` (upgrade header) | `120` | Idle disconnect timeout in seconds. |
| Client control frame `{ "type": "commit" }` | Sent on user stop / disconnect | Documented mid-session control frame forcing immediate buffer flush/finalization. |
| Server-to-client events handled | `connected`, `speech_start`, `processing`, `transcript`, `error` (plus defensive `partial` / `is_final === false` handling) | Documented VAD-segmented WebSocket response events. |
| Upstream keep-alive | Standard RFC 6455 WebSocket `ping` from proxy every 25 s (browser-to-proxy uses `{ "type": "ping" }` / `{ "type": "pong" }` terminated at our proxy and never sent to Gnani) | Standard WebSocket protocol keep-alive without inventing custom upstream JSON frames. |

---

## 2. Timbre v3.0 Text-to-Speech

- **REST Endpoint (in use):** `POST https://api.vachana.ai/api/v1/tts/inference`  
- **Streaming WebSocket Endpoint (documented):** `wss://api.vachana.ai/api/v1/tts`  
- **Docs:** [Timbre Inference](https://docs.gnani.ai/api/TTS/tts-inference)

| Parameter / Setting | Value Used in ASHA SAKHI | Official Gnani Documentation Source |
|---|---|---|
| `X-API-Key-ID` (header) | Server-only `process.env.GNANI_API_KEY_ID` | Required Timbre auth header. |
| `model` | `timbre-v3.0` (overridable via `GNANI_TTS_MODEL`) | Official Timbre v3.0 model ID. |
| `voice` | `Shivani` (overridable via `GNANI_TTS_VOICE` or `GNANI_TTS_VOICE_EN/HI/MR`) | Documented universal multilingual voice in Timbre v3.0 (supports all 10 languages including `en-IN`, `hi-IN`, `mr-IN`). |
| `language` | `en-IN`, `hi-IN`, `mr-IN` | Documented BCP-47 language codes for Timbre v3.0. |
| `speed` | `0.95` (read-back), `1.0` (danger alert) | Documented float pacing parameter (default `1.0`). |
| `audio_config` | `{ sample_rate: 48000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" }` (live `/api/gnani/tts`); `sample_rate: 24000` (officially supported) for pre-generated static read-back WAVs | Documented WAV PCM output format (`sample_rate` supports `8000`, `16000`, `22050`, `24000`, `44100`, `48000`). |

### Server Queue, Backoff Retry, Pre-caching & Streaming Notes
- **Server-side concurrency-1 queue & 429 backoff (`server/timbreQueue.mjs`):** Both `server/index.mjs` and `api/gnani/tts.js` serialize all upstream Gnani Timbre calls through a strict concurrency-1 FIFO queue with an in-memory 48-entry SHA-256 LRU cache. On upstream HTTP `429`, the worker holds the slot and retries up to 2 times with exponential backoff + jitter (`750 ms`, `1,500 ms`, or upstream `Retry-After` clamped to `4,000 ms`). When retries are exhausted, the server returns `429` with `X-Speech-Error-Code: UPSTREAM_429_EXHAUSTED` and `retriesAttempted`, and the UI immediately renders a visible localized fallback banner (`Timbre busy after retry · Browser speech/Text-only fallback active (not Gnani)`).
- **Danger alerts:** Pre-generated via `npm run gnani:alert-audio` into `public/audio/alert-{en,hi,mr}.wav` and preloaded into browser memory + `CacheStorage` so alert audio plays in **0 ms network fetch** even if connectivity drops.
- **Pre-generated read-back templates (`npm run gnani:readback-audio`):** 10 high-likelihood scripted demo templates (visit-type + weight + next-visit across all 5 seeded beneficiaries, all 6 visit types, sample corrections, and back-from-alert drafts) × 3 languages (`en`, `hi`, `mr`) = **30 cached WAVs** (12.76 MB on disk) in `public/audio/readback/`. **Zero read-back WAVs are preloaded on first load**; a cached file is fetched lazily on demand for the active language **only when the spoken record matches the template exactly** (any other value calls live `/api/gnani/tts` or shows the labelled fallback).
- **Alert warming:** Only the active language's alert WAV (`~0.41–0.50 MB`) is warmed on initial load (reduced total first-load audio from **~3.08 MB → 0.41 MB**, and read-back first-load payload from **1.72 MB → 0 B**).
- **Read-back speed:** Shortened read-back wording from ~123 chars to ~71 chars reduced uncached REST p50 latency from **5,601 ms → 3,823 ms (-31.7%)**; pre-generated and repeated phrases play from cache in **~0–15 ms**.
- **Normal 3-minute demo Timbre call budget:** Before read-back pre-generation, a normal 3-minute demo (normal ANC visit + weight correction + replay + emergency alert/back-to-draft + Hindi/Marathi negation + newborn visit) made **5–6 live Timbre calls** (0 for alerts). With the 30 pre-generated read-back templates + client/server LRU cache, the scripted demo makes **0 live Timbre calls**, and adding 1–2 live ad-hoc judge utterances with novel values makes **1–3 live Timbre calls** (all serialized at concurrency 1 with 429 retry).
- **WebSocket TTS probe (`wss://api.vachana.ai/api/v1/tts`):** Probed live with `X-API-Key-ID` and the documented `timbre-v3.0` JSON payload; the socket timed out after 15 s (`WS TTS timeout`) without returning audio chunks on this account. Therefore ASHA SAKHI continues to use the verified HTTPS REST endpoint (`POST /api/v1/tts/inference`) with concurrency-1 queueing, concise wording, and caching.

---

## 3. Observed Live Service Behavior (`multi_lang_codes` Message)

During Phase 2 live testing against `wss://api.vachana.ai/stt/v3/stream`, passing a comma-separated `language_code` header (`mr-IN,en-IN`, `hi-IN,en-IN`, or `en-IN,hi-IN,mr-IN`) was rejected by the live server with the exact error message:

> `Invalid language_code: exactly one locale is required (e.g. hi-IN). Received: mr-IN, en-IN. Use multi_lang_codes for parallel multi-locale transcription.`

**Decision:** Because `multi_lang_codes` is not documented with exact header formatting/semantics on the public `/stt-websocket` page, ASHA SAKHI does **not** send `multi_lang_codes`. We strictly use the documented single-locale `language_code` values (`indic-auto`, `hi-IN`, `mr-IN`) paired with `format=codemix`.

Also observed during batch evaluation: sending 2–3 concurrent Timbre REST requests returned upstream HTTP `429`; sequential requests (~1 req / 4–10 s) succeeded reliably.

---

## 4. Open Questions for Gnani Staff

1. **Interim partial transcripts on `/stt/v3/stream`:** The public WebSocket documentation describes VAD-segmented output (`speech_start` → `processing` → finalized `transcript` after `x-min-silence-ms`). Is there an officially supported header or parameter to receive sub-second interim/partial tokens before VAD end-of-speech, so emergency danger-sign detection can trigger even before the speaker pauses?
2. **Official specification for `multi_lang_codes`:** What is the exact documented header name, delimiter format, maximum number of locales, and interaction with `format=codemix` for `multi_lang_codes` on `/stt/v3/stream`? Does it improve Marathi/Hindi + English code-mix accuracy or latency over `indic-auto` / single locale + `format=codemix`?
3. **Timbre v3.0 hackathon rate limits & WebSocket streaming availability:** What is the exact requests-per-minute (RPM) and concurrency cap for Timbre REST (`/api/v1/tts/inference`), and is `wss://api.vachana.ai/api/v1/tts` enabled on hackathon API keys (our live probe timed out after 15 s)?
4. **Prisma `bias_list` / `bias_score` syntax on WebSocket:** What is the exact documented header serialization format for `bias_list` and `bias_score` on `wss://api.vachana.ai/stt/v3/stream` (JSON array vs comma-separated string, max term count, Unicode/Devanagari support) so we can boost clinical terms (`ANC`, `PNC`, `HBNC`, `HBYC`, `BCG`, `OPV`, `DPT`, `Pentavalent`, `Hepatitis B`, `Measles`, `TT1`, `TT2`, `BEN-1001`) without relying on undocumented formatting?
