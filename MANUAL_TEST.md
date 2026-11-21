# ASHA SAKHI — Manual Phone Verification Guide

Use this checklist on a real smartphone (Android Chrome and/or iOS Safari) over HTTPS (Vercel Preview/Production URL, or a local HTTPS tunnel) to complete the device-level checks that automated headless Chromium tests cannot physically observe.

> **Prerequisite:** Deploy with server-only `GNANI_API_KEY_ID` configured (or run `npm run dev` with `.env.local`), confirm `GET /api/health` returns `{"status":"ok","gnaniConfigured":true}`, and verify phone volume is turned up and silent/Do Not Disturb mode is off.

---

## 1. Real Microphone Capture & Live Transcript (Gnani Prisma v3.0)

1. Open the app URL on the phone. Confirm the mobile 390 px-style layout opens directly on **Home** without login and displays the **Synthetic demo data** pill in the top bar.
2. Open **Settings** (gear icon) and confirm **Voice provider** is set to **Gnani Prisma v3.0**. Return to **Home**.
3. Tap **BEN-1001 · Sunita Patil** to open the Visit screen. Confirm the provider pill reads `Gnani Prisma v3.0`.
4. Tap the teal microphone button (**Tap to speak**). When the browser prompts for microphone access, tap **Allow**.
5. Speak clearly in English, Hindi, Marathi, or code-mix:
   > *"ANC follow-up visit. Weight 55 kilo. Next visit 20 November."*
6. Observe the **LIVE TRANSCRIPT** card while speaking:
   - Confirm text streams in near real time.
   - Confirm the provider badge stays `Gnani Prisma v3.0`.
7. Tap the red microphone button to stop listening.
8. Confirm all five structured fields populate (Beneficiary ID `BEN-1001`, Visit type `ANC`, Weight `55 kg`, Vaccinations due `None reported`, Next visit date `20 November`) and the **Review record** panel opens.

### Microphone & Network Fallback Checks

9. **Permission denied:** In the phone browser's site permissions, change **Microphone** to **Block**, reload the page, open **BEN-1001**, and tap the microphone button.
   - Confirm a clear error alert explains microphone permission was denied.
   - Confirm the provider pill switches to **Typed entry (Fallback)** (never `Gnani Prisma v3.0`).
   - Confirm the **Typed visit fallback (not Gnani)** input appears; type `ANC visit weight 54 kg next visit 20 November`, tap the check button, and confirm fields extract and can be saved.
   - Re-enable microphone permission afterward.
10. **No network / Airplane mode:** Enable Airplane mode on the phone and tap the microphone button.
    - Confirm the offline fallback notice appears, the provider label switches to **Typed entry (Fallback)**, and typing a visit note still extracts fields and triggers deterministic danger rules locally.
    - Disable Airplane mode afterward.

---

## 2. Timbre v3.0 Spoken Read-Back & Replay

1. After completing step 1.8 above (with volume up), listen during **Review record**:
   - Confirm spoken read-back plays automatically (or if iOS/Android autoplay blocks automatic playback, confirm the status reads `Audio blocked by browser · Tap Listen` and the full record text remains visible).
   - Confirm the speech output status badge reads `Gnani Timbre v3.0` when Timbre plays.
2. Tap the **Listen** button on the read-back card to replay the full record.
   - Confirm natural-sounding Timbre audio replays clearly without overlap or clipping.
3. Tap **Listen** on the **LIVE TRANSCRIPT** card and confirm it reads back the captured transcript.
4. **Spoken correction check:** Tap **Correct field**, then tap **Speak correction (Browser speech)** and say *"Weight is 56 kilo"* (or use the typed input if the mobile browser does not support Web Speech Recognition).
   - Confirm ONLY **Weight** changes to `56 kg` while Next visit date stays `20 November`.
   - Confirm the correction history lists `Weight: 55 kg → 56 kg` with the current time.
5. Tap **Confirm & save** and confirm the **Record saved** banner appears.

---

## 3. Three Languages: English, Hindi, and Marathi

1. Return to **Home** and switch the top-bar language selector from `EN` to `हिंदी`.
   - Confirm the header badge (`कृत्रिम डेमो डेटा`), greeting (`नमस्ते, आशा`), stats cards, beneficiary types/ages/due badges, and bottom navigation tabs all render in Hindi without untranslated English UI labels.
2. Open **BEN-1001**, tap **आपातकाल** (Simulated) or speak *"गर्भवती को खून आ रहा है"*.
   - Confirm the danger alert displays in Hindi (`खतरे का संकेत`, `एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।`, `गर्भावस्था में रक्तस्राव`, `समीक्षा लंबित`).
   - Listen to the spoken alert and confirm it speaks Hindi.
   - Close the alert and return to **Home** (`होम`).
3. Switch the top-bar language selector to `मराठी`.
   - Confirm the header badge (`कृत्रिम डेमो डेटा`), greeting (`नमस्कार, आशा`), stats, beneficiary rows, and bottom navigation tabs render in Marathi.
4. Open **BEN-1001**, tap **तातडीची मदत** (Simulated) or speak *"गर्भवतीला रक्तस्राव होत आहे"*.
   - Confirm the danger alert displays in Marathi (`धोक्याचे लक्षण`, `पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.`, `गर्भधारणेदरम्यान रक्तस्राव`, `पुनरावलोकन प्रलंबित`).
   - Listen to the spoken alert and confirm it speaks Marathi.
5. Switch back to `EN`.

---

## 4. Emergency Alert Vibration & Speech (Device Hardware Check)

1. Ensure the phone is **not** on silent / battery-saver mode (Android Chrome supports `navigator.vibrate`; iOS Safari does not implement the Web Vibration API).
2. Open **BEN-1001** and trigger **Emergency** (either by speaking *"Pregnant woman la bleeding hot aahe"* via Gnani Prisma or tapping **Emergency · Simulated**).
3. Verify **before** any read-back panel appears:
   - The full-screen danger alert overlay interrupts immediately.
   - **On Android Chrome:** Feel the two-pulse vibration pattern (`180 ms – pause 80 ms – 180 ms`) and confirm the status box reads `Alert vibration triggered`.
   - **On iOS Safari / unsupported browsers:** Confirm no crash occurs, the pulsing red visual warning is active, and the status box reads `Device vibration unavailable · Visual alert active`.
   - Confirm the spoken warning plays immediately. If browser autoplay policy blocks playback, confirm the warning text stays prominently displayed and tapping **Play alert audio** plays the spoken warning cleanly.
4. Tap **Show nearest PHC** and confirm the Map opens centered on **Sample PHC North** (`Sample facility · 1.8 km`) with a **Back to draft** button.
5. Tap **Back to draft**, confirm the draft fields and `Danger sign · PREG-01` badge are retained, then tap **Confirm & save**.

---

## 5. Map Taps, Hierarchy Switching & Labels

1. Tap the **Map** tab in the bottom navigation bar.
2. Confirm both labels are visible at the top and bottom of the screen:
   - `Sample geography, not real boundaries`
   - `Aggregated view · no continuous tracking`
3. Test the hierarchy selectors at the top of the map:
   - Switch **District** to `Sample District C` → confirm **Block** updates to `Demo Block B` and **Village** updates to `Riverbend`.
   - Switch **Block** to `Demo Block A` → confirm **Village** updates to `Pipalwadi`.
   - Tap the village chips below the map (`Pipalwadi`, `Lotuswadi`, `Riverbend`) → confirm District and Block stay in sync and the active village polygon outline updates.
4. Tap a household pin inside **Pipalwadi**:
   - Confirm the pin detail card opens showing the beneficiary name and live status (`Visit pending`, `Visit completed`, or `Danger sign` for a red pin after an emergency).
   - Tap `×` to dismiss the pin detail card.
5. Scroll to **Village summary**:
   - Confirm each village card shows accurate `completed · pending` counts and percentage bar (e.g. `1 completed · 1 pending · 50%` after saving one visit in Pipalwadi).
   - Confirm an emergency visit displays a red pin on the map.
6. *(Optional offline tile test)* Enable Airplane mode and reopen **Map**: confirm the schematic SVG fallback appears with `Map tiles unavailable · schematic view` while household pins remain tappable.

---

## 6. PWA Installability, Offline Queue & Screen Reader Check (Phase 3)

1. **Installable PWA:** On Android Chrome (or iOS Safari Share → Add to Home Screen), install **ASHA SAKHI** to the home screen and open it. Confirm the branded heart splash screen renders cleanly and the app opens in standalone display mode.
2. **Screen reader (TalkBack / VoiceOver):** Turn on TalkBack (Android) or VoiceOver (iOS) and swipe through **Home**, **Visit**, the **Danger sign?** picker, the emergency **Alert dialog**, **Settings** (including **Text size** → `Large` / `Extra large`), and **About & limitations**. Confirm every button, icon, language selector, live transcript (`aria-live="polite"`), and emergency alert (`role="alertdialog"`, `aria-live="assertive"`) announces cleanly.
3. **Offline draft persistence:** Switch on Airplane mode, type and save a visit on **BEN-1001**, close and reopen the app while still offline, confirm the offline banner and **Offline draft queue** show `Pending`, then disable Airplane mode and confirm it transitions to `Synced` without creating a duplicate visit.

---

## Recording Results

After running these steps on the target phone, record device model, OS/browser version, date, and pass/fail notes in `CHECKLIST.md` to promote `NEEDS HUMAN TEST` items to `DONE`.
