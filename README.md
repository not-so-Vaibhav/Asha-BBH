# ASHA SAKHI

Mobile first, voice first synthetic visit register for the Gnani Voice Hackathon PS1. The app opens on Home without login. It uses synthetic records and shows the **Synthetic demo data** marker. See [CHECKLIST.md](CHECKLIST.md) for verified status and evidence.

## Run locally

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Open the Vite URL on a phone or set the browser viewport to 390 × 844. App data is stored in localStorage. `npm run build` makes `dist/`; `npm run test` runs Vitest domain tests.

## Demo flows

- Choose BEN-1001 Sunita Patil, tap **Normal visit · Simulated**, and review the five fields. Use **Correct field** and `No, weight is 56 kilo`, or choose **Speak correction (Browser speech)**, then confirm. The app records the correction and creates the 20 November follow-up.
- Choose **Emergency · Simulated**. A deterministic rule shows a referral alert before read-back. **Show nearest PHC** opens the map with the sample facility highlighted; return to the draft and confirm to save the danger flag.
- BEN-1002 is the newborn case. Choose **Newborn concern · Simulated** for NB-01 and NB-03. “No bleeding” stays quiet; “Maybe bleeding” is flagged for review.

All simulated transcripts and browser speech are identified as simulated/browser behavior; neither is Gnani. The browser Speech Synthesis API is used for prototype read-back when available. Browser speech recognition is optional and browser dependent.

## Gnani integration required

The final build requires Gnani Prisma STT and Timbre TTS. No endpoints or credentials were supplied, so both integrations remain unconfigured and explicitly contain `TODO(GNANI)`. Provide official endpoint URLs, credentials/auth method, streaming protocol, supported language/voice identifiers, and error/reconnect behavior before integration. The default provider remains **Simulated**.

## Map and scope

Map geometry, household pins, and facility data are synthetic and labelled **Sample geography, not real boundaries**. OpenStreetMap tiles provide visual context; a drawn SVG schematic appears if tiles fail. No worker location is tracked. The prototype makes no claims of government integration, offline speech, or measured accuracy. No diagnosis, medicine, or dosage guidance is provided.

Login, roles, registration, supervisor or national dashboards, learning centre, government integration, PostGIS, Celery, and Redis are out of scope and roadmap only.

## Browser acceptance suite

`npm run e2e` runs the five 390 × 844 Playwright acceptance scenarios in `tests/e2e/acceptance.spec.ts`. Install the browser with `npx playwright install chromium` first. The Playwright-matched Chromium binary is installed, but macOS denies Chromium’s `bootstrap_check_in` call in this sandbox, so execution stops before assertions. Run in an environment where browser launch is allowed. Domain tests and key UI flows were separately exercised in the running app. See `CHECKLIST.md` for that limitation.
