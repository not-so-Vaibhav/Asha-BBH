import { test, expect, type Page } from '@playwright/test';
import { enterAppAsDemo } from './helpers';

function makeSilentWav(durationMs = 120): Buffer {
  const sampleRate = 16_000;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

async function openVisit(page: Page, id = 'BEN-1001') {
  await enterAppAsDemo(page);
  await page.getByRole('button', { name: new RegExp(id) }).click();
}

test.describe('P0 voice, TTS, corrections, and alert feedback verification', () => {
  test('Gnani STT live transcript flow works end-to-end through /api/gnani/stt with fake mic stream', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ['microphone'],
    });
    const page = await context.newPage();

    await page.route('**/api/gnani/status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, sttModel: 'prisma-v3.0', ttsModel: 'timbre-v3.0', ttsVoice: 'Shivani' }) }),
    );
    await page.route('**/api/gnani/tts', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav() }),
    );

    // Provide a synthetic MediaStream via Web Audio oscillator so getUserMedia works reliably in headless Chromium
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const dest = ctx.createMediaStreamDestination();
            osc.frequency.value = 440;
            osc.connect(dest);
            osc.start();
            return dest.stream;
          },
        },
      });
    });

    let binaryFramesReceived = 0;
    await page.routeWebSocket(/\/api\/gnani\/stt/, (ws) => {
      ws.send(JSON.stringify({ type: 'connected' }));
      ws.onMessage((msg) => {
        if (Buffer.isBuffer(msg)) {
          binaryFramesReceived += 1;
          if (binaryFramesReceived === 1) {
            ws.send(JSON.stringify({
              type: 'transcript',
              text: 'ANC visit weight 55 kilo next visit 20 November',
            }));
          }
        } else if (typeof msg === 'string' && msg.includes('commit')) {
          ws.close({ code: 1000, reason: 'done' });
        }
      });
    });

    await openVisit(page);
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    await expect(page.getByText(/ANC visit weight 55 kilo/)).toBeVisible({ timeout: 7000 });
    await expect(page.locator('.visit-head .provider')).toHaveText('Gnani Prisma v3.0');
    await page.getByRole('button', { name: 'Stop listening' }).click();
    await expect(page.getByText('55 kg', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('20 November', { exact: true }).first()).toBeVisible();
    expect(binaryFramesReceived).toBeGreaterThan(0);

    await context.close();
  });

  test('Gnani STT failure modes (permission denied, offline, Gnani error) show visible fallback and keep typed path working', async ({ page }) => {
    await page.route('**/api/gnani/status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, sttModel: 'prisma-v3.0', ttsModel: 'timbre-v3.0', ttsVoice: 'Shivani' }) }),
    );
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 503, body: JSON.stringify({ error: 'unavailable' }) }));

    // 1. Permission denied
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const err = new Error('Permission denied');
            err.name = 'NotAllowedError';
            throw err;
          },
        },
      });
    });
    await openVisit(page);
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    await expect(page.getByRole('alert')).toContainText(/Microphone permission was denied/);
    await expect(page.locator('.visit-head .provider')).toHaveText('Typed entry (Fallback)');
    await expect(page.locator('.visit-head .provider')).not.toHaveText(/Gnani/);

    // Verify typed fallback path completes visit extraction
    await page.locator('.typed-fallback input').fill('ANC visit weight 54 kg next visit 20 November');
    await page.locator('.typed-fallback button').click();
    await expect(page.getByText('54 kg', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toBeVisible();

    // 2. Offline / no network
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    await expect(page.getByRole('alert')).toContainText(/No network connection/);
    await expect(page.locator('.visit-head .provider')).toHaveText('Typed entry (Fallback)');

    // 3. Gnani server error (unconfigured / WS error)
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const ctx = new AudioContext();
            const dest = ctx.createMediaStreamDestination();
            return dest.stream;
          },
        },
      });
    });
    await page.routeWebSocket(/\/api\/gnani\/stt/, (ws) => {
      ws.send(JSON.stringify({ type: 'error', message: 'Speech service unavailable.' }));
      ws.close({ code: 1011, reason: 'unavailable' });
    });
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    await expect(page.getByRole('alert')).toContainText(/Gnani Prisma v3.0 is currently unavailable/);
    await expect(page.locator('.visit-head .provider')).toHaveText('Typed entry (Fallback)');
  });

  test('Timbre read-back plays, replays, and fails gracefully on server error, 429 retry exhaustion, or autoplay block', async ({ page }) => {
    let ttsRequests = 0;
    let mode: 'ok' | 'fail' | 'rate-limit' = 'ok';
    // Bypass static pregen cache for this test so we specifically exercise the live /api/gnani/tts path
    await page.route('**/audio/readback/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/api/gnani/tts', (route) => {
      ttsRequests += 1;
      if (mode === 'ok') {
        return route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(80) });
      }
      if (mode === 'rate-limit') {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'x-speech-error-code': 'UPSTREAM_429_EXHAUSTED', 'x-speech-retries': '2', 'retry-after': '3' },
          body: JSON.stringify({ error: 'Speech service is temporarily busy after retry. Fallback active.', code: 'UPSTREAM_429_EXHAUSTED', retriesAttempted: 2 }),
        });
      }
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
    });

    await openVisit(page);
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.locator('.readback .speech-provider')).toHaveText('Gnani Timbre v3.0', { timeout: 8000 });
    expect(ttsRequests).toBe(1);

    // Replay Timbre audio -> served instantly from phrase cache (no extra /api/gnani/tts network call)
    await page.locator('.full-replay').click();
    await expect(page.locator('.readback .speech-provider')).toHaveText('Gnani Timbre v3.0');
    expect(ttsRequests).toBe(1);

    // Upstream 429 after retry exhaustion -> visible labelled fallback (never Gnani), read-back text stays visible
    mode = 'rate-limit';
    await page.evaluate(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    });
    await page.getByRole('button', { name: /Correct field/ }).click();
    await page.getByRole('button', { name: 'No, weight is 56 kilo' }).click();
    await expect(page.locator('.readback .speech-provider')).toHaveText('Audio unavailable · Read text below');
    await expect(page.locator('.readback .tts-fallback-notice')).toHaveText('Timbre busy after retry · Text-only fallback active (not Gnani)');
    await expect(page.locator('.readback .record-summary')).toBeVisible();

    // Server 503 unavailable -> visible labelled unavailable fallback
    mode = 'fail';
    await page.getByRole('button', { name: 'Next visit 22 November' }).click();
    await expect(page.locator('.readback .speech-provider')).toHaveText('Audio unavailable · Read text below');
    await expect(page.locator('.readback .tts-fallback-notice')).toHaveText('Timbre unavailable · Text-only fallback active (not Gnani)');

    // Autoplay blocked -> clear notice and text remains visible
    mode = 'ok';
    await page.evaluate(() => {
      HTMLMediaElement.prototype.play = async () => {
        const err = new Error('Autoplay prevented');
        err.name = 'NotAllowedError';
        throw err;
      };
    });
    await page.locator('.full-replay').click();
    await expect(page.locator('.readback .speech-provider')).toHaveText('Audio blocked by browser · Tap Listen');
    await expect(page.locator('.readback .record-summary')).toBeVisible();
  });

  test('pre-generated read-back template plays lazily on exact match only, and any non-template value calls live Timbre or labelled fallback', async ({ page }) => {
    const readbackUrlsFetched: string[] = [];
    let liveTtsCalls = 0;
    let liveMode: 'ok' | '429' = 'ok';

    await page.route('**/api/gnani/tts', (route) => {
      liveTtsCalls += 1;
      if (liveMode === '429') {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'x-speech-error-code': 'UPSTREAM_429_EXHAUSTED', 'x-speech-retries': '2' },
          body: JSON.stringify({ error: 'busy', code: 'UPSTREAM_429_EXHAUSTED', retriesAttempted: 2 }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(60) });
    });
    await page.route('**/audio/readback/**', (route) => {
      readbackUrlsFetched.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(60) });
    });

    // 1. First load must NOT eagerly preload read-back audio
    await openVisit(page);
    expect(readbackUrlsFetched).toEqual([]);

    // 2. Exact template match uses pre-generated WAV lazily with 0 live /api/gnani/tts calls
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.locator('.readback .speech-provider')).toHaveText('Gnani Timbre v3.0', { timeout: 6000 });
    expect(readbackUrlsFetched).toEqual(['/audio/readback/anc-55-20nov-en.wav']);
    expect(liveTtsCalls).toBe(0);

    // 3. Mutating weight to an uncached value (57 kg) MUST NOT use cached read-back and MUST call live /api/gnani/tts
    await page.getByRole('button', { name: /Correct field/ }).click();
    await page.getByLabel('Correction').fill('No, weight is 57 kilo');
    await page.locator('details.typed:not(.typed-note-disclosure) .type-row button').click();
    await expect(page.locator('.readback .record-summary')).toContainText('57 kg');
    await expect(page.locator('.readback .speech-provider')).toHaveText('Gnani Timbre v3.0');
    expect(readbackUrlsFetched).toEqual(['/audio/readback/anc-55-20nov-en.wav']);
    expect(liveTtsCalls).toBe(1);

    // 4. Another non-template value when live Timbre returns 429 MUST show labelled fallback (never cached file)
    liveMode = '429';
    await page.evaluate(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    });
    await page.getByLabel('Correction').fill('No, weight is 59 kilo');
    await page.locator('details.typed:not(.typed-note-disclosure) .type-row button').click();
    await expect(page.locator('.readback .tts-fallback-notice')).toHaveText('Timbre busy after retry · Text-only fallback active (not Gnani)');
    expect(liveTtsCalls).toBe(2);
    expect(readbackUrlsFetched).toEqual(['/audio/readback/anc-55-20nov-en.wav']);
  });

  test('ASR safety net shows Heard: line and manual Danger sign? shortcut logs source=manual in referral and audit log', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(40) }));
    await page.route('**/audio/alert-en.wav', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(40) }));

    // 1. Pregnant beneficiary: Heard: line displays exact checked transcript & Danger sign? shows ONLY pregnancy rules
    await openVisit(page, 'BEN-1001');
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('ANC visit weight 55 kg next visit 20 November');
    await page.locator('details.typed-note-disclosure button').click();
    await expect(page.getByTestId('alert-heard-line')).toContainText('Heard: ANC visit weight 55 kg next visit 20 November');

    await page.getByRole('button', { name: 'Danger sign?' }).click();
    const picker = page.getByRole('region', { name: /Predefined danger signs/ });
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('PREG-01');
    await expect(picker).toContainText('PREG-02');
    await expect(picker).not.toContainText('NB-01');
    await expect(picker).toContainText('Referral checklist only · no diagnosis');

    // Tap PREG-01 manually -> triggers alert + referral + audit log with source='manual'
    await picker.locator('button[data-rule-id="PREG-01"]').click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('PREG-01');
    await expect(alert).toContainText('Source: manual');

    // Verify persisted auditLog & referral in localStorage record source='manual'
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('asha-sakhi-demo') || '{}'));
    expect(stored.state.referrals[0].source).toBe('manual');
    expect(stored.state.referrals[0].ruleId).toBe('PREG-01');
    expect(stored.state.auditLog[0]).toMatchObject({
      type: 'danger_triggered',
      ruleId: 'PREG-01',
      source: 'manual',
      beneficiaryId: 'BEN-1001',
    });

    // Verify Referrals screen also labels Source: manual
    await alert.getByRole('button', { name: /Back to draft/ }).click();
    await page.locator('.bottom').getByRole('button', { name: 'Referrals' }).click();
    await expect(page.locator('.timeline-card').first()).toContainText('Source: manual');

    // 2. Newborn beneficiary: Danger sign? shows ONLY newborn rules (NB-01..NB-05)
    await page.locator('.bottom').getByRole('button', { name: 'People' }).click();
    await page.getByRole('button', { name: /BEN-1002/ }).click();
    await page.getByRole('button', { name: 'Danger sign?' }).click();
    const nbPicker = page.getByRole('region', { name: /Predefined danger signs/ });
    await expect(nbPicker).toContainText('NB-01');
    await expect(nbPicker).toContainText('NB-05');
    await expect(nbPicker).not.toContainText('PREG-01');
  });

  test('Gnani STT reconnects after unexpected WebSocket close without losing transcript, and Settings debug panel logs metrics only', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ['microphone'],
    });
    const page = await context.newPage();

    await page.route('**/api/gnani/status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, sttModel: 'prisma-v3.0', ttsModel: 'timbre-v3.0', ttsVoice: 'Shivani' }) }),
    );
    await page.route('**/api/gnani/tts', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(40) }),
    );

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const dest = ctx.createMediaStreamDestination();
            osc.frequency.value = 440;
            osc.connect(dest);
            osc.start();
            return dest.stream;
          },
        },
      });
    });

    let wsConnections = 0;
    await page.routeWebSocket(/\/api\/gnani\/stt/, (ws) => {
      wsConnections += 1;
      const attempt = wsConnections;
      ws.send(JSON.stringify({ type: 'connected' }));
      let sentSegment = false;
      ws.onMessage((msg) => {
        if (Buffer.isBuffer(msg) && !sentSegment) {
          sentSegment = true;
          if (attempt === 1) {
            ws.send(JSON.stringify({ type: 'transcript', text: 'ANC visit weight 55 kilo' }));
            // Simulate Vercel maxDuration / unexpected close mid-session
            setTimeout(() => ws.close({ code: 1006, reason: 'maxDuration reached' }), 150);
          } else {
            ws.send(JSON.stringify({ type: 'transcript', text: 'next visit 20 November' }));
          }
        } else if (typeof msg === 'string' && msg.includes('commit')) {
          ws.close({ code: 1000, reason: 'done' });
        }
      });
    });

    await openVisit(page);
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    await expect(page.getByText(/ANC visit weight 55 kilo/)).toBeVisible({ timeout: 7000 });
    // Second segment arrives after automatic reconnect while preserving the first segment
    await expect(page.getByText(/ANC visit weight 55 kilo next visit 20 November/)).toBeVisible({ timeout: 8000 });
    expect(wsConnections).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Stop listening' }).click();
    await expect(page.getByText('55 kg', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('20 November', { exact: true }).first()).toBeVisible();

    // Open hidden diagnostics panel in Settings and verify metrics (and zero transcripts)
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Voice diagnostics' }).click();
    const panel = page.getByRole('region', { name: 'Voice diagnostics' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Reconnects');
    await expect(panel).toContainText('1');
    await expect(panel).not.toContainText('55 kilo');

    await context.close();
  });

  test('cached emergency alert audio plays without calling /api/gnani/tts even if live endpoint fails', async ({ page }) => {
    let liveTtsCalls = 0;
    await page.route('**/api/gnani/tts', (route) => {
      liveTtsCalls += 1;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline' }) });
    });
    await page.route('**/audio/alert-en.wav', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(60) }),
    );

    await openVisit(page);
    await page.getByRole('button', { name: /Emergency/ }).click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toBeVisible();
    await expect(alert.getByText('Gnani Timbre v3.0')).toBeVisible({ timeout: 5000 });
    expect(liveTtsCalls).toBe(0);
  });

  test('danger alert fires on the first finalized segment without waiting for later segments, read-back, or TTS', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ['microphone'],
    });
    const page = await context.newPage();

    await page.route('**/api/gnani/status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, sttModel: 'prisma-v3.0', ttsModel: 'timbre-v3.0', ttsVoice: 'Shivani' }) }),
    );
    // Deliberately stall /api/gnani/tts to prove alert never waits on live TTS
    let liveTtsRequested = false;
    await page.route('**/api/gnani/tts', async (route) => {
      liveTtsRequested = true;
      await new Promise((r) => setTimeout(r, 8_000));
      await route.fulfill({ status: 503, body: '{}' });
    });
    await page.route('**/audio/alert-en.wav', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(60) }),
    );

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const dest = ctx.createMediaStreamDestination();
            osc.frequency.value = 440;
            osc.connect(dest);
            osc.start();
            return dest.stream;
          },
        },
      });
    });

    let secondSegmentSent = false;
    await page.routeWebSocket(/\/api\/gnani\/stt/, (ws) => {
      ws.send(JSON.stringify({ type: 'connected' }));
      let triggered = false;
      ws.onMessage((msg) => {
        if (Buffer.isBuffer(msg) && !triggered) {
          triggered = true;
          // Segment 1 arrives with danger trigger; Segment 2 is intentionally delayed 4 seconds
          ws.send(JSON.stringify({ type: 'transcript', text: 'Pregnant woman has vaginal bleeding since morning.' }));
          setTimeout(() => {
            secondSegmentSent = true;
            try { ws.send(JSON.stringify({ type: 'transcript', text: 'Weight 55 kilo next visit 20 November.' })); } catch {}
          }, 4_000);
        } else if (typeof msg === 'string' && msg.includes('commit')) {
          ws.close({ code: 1000, reason: 'stopped on danger' });
        }
      });
    });

    await openVisit(page, 'BEN-1001');
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toBeVisible({ timeout: 2500 });
    expect(secondSegmentSent).toBe(false);
    expect(liveTtsRequested).toBe(false);
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toHaveCount(0);
    await expect(alert.getByText(/PREG-01/).first()).toBeVisible();

    await context.close();
  });

  test('context-assisted visit type resolution flags context in UI/read-back and never overrides explicit mentions', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(30) }));

    // Newborn + fuzzy acronym -> resolves HBNC via context and clearly labels it for check
    await openVisit(page, 'BEN-1002');
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('BEN-1002 HPMC visit weight 3.2 kg next visit 18 November');
    await page.locator('details.typed-note-disclosure button').click();
    await expect(page.getByLabel('Visit type')).toHaveValue('HBNC');
    await expect(page.locator('.field.select-field')).toContainText('Context · please check');
    await expect(page.locator('.readback .record-summary')).toContainText('HBNC (Context · please check)');

    // Explicit visit type on Newborn must NEVER be overridden
    await page.locator('details.typed-note-disclosure input').fill('BEN-1002 General visit weight 3.2 kg next visit 18 November');
    await page.locator('details.typed-note-disclosure button').click();
    await expect(page.getByLabel('Visit type')).toHaveValue('General');
    await expect(page.locator('.readback .record-summary')).not.toContainText('Context · please check');
  });

  test('typed corrections update each of the five fields individually and log old/new/time in history', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(40) }));
    await openVisit(page);
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toBeVisible({ timeout: 7000 });

    await page.getByRole('button', { name: /Correct field/ }).click();
    const input = page.getByLabel('Correction');
    const applyBtn = page.locator('details.typed:not(.typed-note-disclosure) .type-row button');

    // 1. Weight
    await input.fill('No, weight is 56 kilo');
    await applyBtn.click();
    await expect(page.locator('.record-summary')).toContainText('56 kg');
    await expect(page.locator('.record-summary')).toContainText('20 November');
    await expect(page.locator('.correction-history')).toContainText(/Weight: 55 kg → 56 kg/);

    // 2. Next visit date
    await input.fill('next visit 22 November');
    await applyBtn.click();
    await expect(page.locator('.record-summary')).toContainText('22 November');
    await expect(page.locator('.record-summary')).toContainText('56 kg');
    await expect(page.locator('.correction-history')).toContainText(/Next visit date: 2026-11-20 → 2026-11-22/);

    // 3. Vaccinations due
    await input.fill('vaccinations due: OPV and DPT');
    await applyBtn.click();
    await expect(page.locator('.record-summary')).toContainText('OPV and DPT');
    await expect(page.locator('.record-summary')).toContainText('56 kg');
    await expect(page.locator('.correction-history')).toContainText(/Vaccinations due: None reported → OPV and DPT/);

    // 4. Visit type
    await input.fill('visit type is PNC');
    await applyBtn.click();
    await expect(page.locator('.record-summary')).toContainText('PNC');
    await expect(page.locator('.record-summary')).toContainText('OPV and DPT');
    await expect(page.locator('.correction-history')).toContainText(/Visit type: ANC → PNC/);

    // 5. Beneficiary ID
    await input.fill('beneficiary ID is BEN-1002');
    await applyBtn.click();
    await expect(page.locator('.record-summary')).toContainText('BEN-1002');
    await expect(page.locator('.record-summary')).toContainText('PNC');
    await expect(page.locator('.correction-history')).toContainText(/Beneficiary ID: BEN-1001 → BEN-1002/);
    expect(await page.locator('.correction-history p').count()).toBe(5);
  });

  test('alert speech and vibration feature checks display clear fallback and support vibration when available', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.route('**/audio/alert-*.wav', (route) => route.fulfill({ status: 503, body: '' }));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    });

    await openVisit(page);
    await page.getByRole('button', { name: /Emergency/ }).click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toBeVisible();
    await expect(alert.getByText('Device vibration unavailable · Visual alert active')).toBeVisible();
    await expect(alert.getByText(/Alert audio blocked or unavailable/)).toBeVisible();
    await expect(alert.getByRole('button', { name: /Play alert audio/ })).toBeVisible();
  });
});

test.describe('P1 beneficiary history, all visit types, follow-up tabs, and referral excerpts', () => {
  test('per-beneficiary visit history and all six visit types work end-to-end', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(30) }));
    const allTypes = ['ANC', 'PNC', 'HBNC', 'HBYC', 'Immunisation', 'General'] as const;

    await openVisit(page, 'BEN-1001');
    const select = page.getByLabel('Visit type');
    for (const vt of allTypes) {
      await select.selectOption(vt);
      await expect(select).toHaveValue(vt);
    }

    // Save an HBYC visit for BEN-1001
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('HBYC visit weight 55 kg next visit 20 November');
    await page.locator('details.typed-note-disclosure button').click();
    await page.getByLabel('Visit type').selectOption('HBYC');
    await page.getByRole('button', { name: /Confirm & save/ }).click();
    await expect(page.getByRole('heading', { name: 'Record saved' })).toBeVisible();

    // Save an Immunisation visit for BEN-1003
    await page.locator('.bottom').getByRole('button', { name: 'People' }).click();
    await page.getByRole('button', { name: /BEN-1003/ }).click();
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('Immunisation visit vaccinations due OPV weight 9 kg next visit 22 November');
    await page.locator('details.typed-note-disclosure button').click();
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    // Verify BEN-1001 history only shows BEN-1001's HBYC visit
    await page.locator('.bottom').getByRole('button', { name: 'People' }).click();
    const rows = page.locator('.beneficiary-row');
    await rows.filter({ hasText: 'BEN-1001' }).getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: /Sunita Patil · History/ })).toBeVisible();
    await page.locator('.history-toggle').first().click();
    await expect(page.locator('.visit-history')).toContainText('HBYC');
    await expect(page.locator('.visit-history')).toContainText('55 kg');
    await expect(page.locator('.visit-history')).not.toContainText('OPV');

    // Verify BEN-1003 history only shows BEN-1003's Immunisation visit
    await page.getByRole('button', { name: 'Back' }).click();
    await rows.filter({ hasText: 'BEN-1003' }).getByRole('button', { name: 'History' }).click();
    await page.locator('.history-toggle').first().click();
    await expect(page.locator('.visit-history')).toContainText('Immunisation');
    await expect(page.locator('.visit-history')).toContainText('OPV');
    await expect(page.locator('.visit-history')).not.toContainText('HBYC');
  });

  test('follow-up Upcoming, Pending, and Overdue tabs filter accurately and mark-done clears them', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(30) }));

    // Upcoming (2026-11-20)
    await openVisit(page, 'BEN-1001');
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('ANC visit weight 55 kg next visit 2026-11-20');
    await page.locator('details.typed-note-disclosure button').click();
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    // Pending (today: 2026-11-13)
    await page.locator('.bottom').getByRole('button', { name: 'People' }).click();
    await page.getByRole('button', { name: /BEN-1003/ }).click();
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('General visit weight 9 kg next visit 2026-11-13');
    await page.locator('details.typed-note-disclosure button').click();
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    // Overdue (past: 2026-11-10)
    await page.locator('.bottom').getByRole('button', { name: 'People' }).click();
    await page.getByRole('button', { name: /BEN-1004/ }).click();
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('ANC visit weight 52 kg next visit 2026-11-10');
    await page.locator('details.typed-note-disclosure button').click();
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    await page.locator('.bottom').getByRole('button', { name: 'Follow-ups' }).click();
    // Upcoming tab
    await expect(page.getByText('Sunita Patil')).toBeVisible();
    await expect(page.getByText('Rekha Jadhav')).toHaveCount(0);
    await expect(page.getByText('Meena Pawar')).toHaveCount(0);

    // Pending tab
    await page.locator('.tabs').getByRole('button', { name: 'Pending' }).click();
    await expect(page.getByText('Rekha Jadhav')).toBeVisible();
    await expect(page.getByText('Sunita Patil')).toHaveCount(0);

    // Overdue tab + Mark done clears it into empty state
    await page.locator('.tabs').getByRole('button', { name: 'Overdue' }).click();
    await expect(page.getByText('Meena Pawar')).toBeVisible();
    await page.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByText('Meena Pawar')).toHaveCount(0);
    await expect(page.getByText('Saved visit dates will create tasks here.')).toBeVisible();
  });
});

test.describe('Map hierarchy, household pins, village stats, coverage, emergency pin, and disclaimers', () => {
  test('switches District/Block/Village, taps household pins, updates stats/coverage, adds red emergency pin, and shows disclaimers', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(30) }));
    await enterAppAsDemo(page);
    await page.locator('.bottom').getByRole('button', { name: 'Map' }).click();

    // Disclaimers visible
    await expect(page.getByText('Sample geography, not real boundaries').first()).toBeVisible();
    await expect(page.getByText('Aggregated view · no continuous tracking').first()).toBeVisible();

    // Initial village stats for Pipalwadi: 0 completed · 2 pending, 0%
    const pipalCard = page.locator('.coverage-item', { hasText: 'Pipalwadi' });
    await expect(pipalCard).toContainText('0 completed · 2 pending');
    await expect(pipalCard).toContainText('0%');

    // Hierarchy switching: District -> Block -> Village stay synced
    await page.getByLabel('District').selectOption('Sample District C');
    await expect(page.getByLabel('Block')).toHaveValue('Demo Block B');
    await expect(page.getByLabel('Village', { exact: true })).toHaveValue('village-river');

    await page.getByLabel('Block').selectOption('Demo Block A');
    await expect(page.getByLabel('Village', { exact: true })).toHaveValue('village-pipal');

    await page.getByLabel('Village', { exact: true }).selectOption('village-lotus');
    await expect(page.getByLabel('District')).toHaveValue('Sample District B');
    await page.locator('.village-select').getByRole('button', { name: 'Pipalwadi' }).click();
    await expect(page.getByLabel('District')).toHaveValue('Sample District A');

    // Tap household pin BEN-1001 -> shows Sunita Patil & Visit pending
    await page.locator('path.household-pin-BEN-1001.pin-pending').dispatchEvent('click');
    await expect(page.locator('.pin-detail')).toContainText('Sunita Patil');
    await expect(page.locator('.pin-detail')).toContainText('Visit pending');

    // Save a normal visit for BEN-1001 -> coverage rises 0% -> 50% and pin shows Visit completed
    await page.locator('.bottom').getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: /BEN-1001/ }).click();
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toBeVisible({ timeout: 7000 });
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    await page.locator('.bottom').getByRole('button', { name: 'Map' }).click();
    await expect(page.getByText('50% Completed')).toBeVisible();
    await expect(pipalCard).toContainText('1 completed · 1 pending');
    await expect(pipalCard).toContainText('50%');
    await page.locator('path.household-pin-BEN-1001.pin-done').dispatchEvent('click');
    await expect(page.locator('.pin-detail')).toContainText('Visit completed');

    // Trigger emergency on BEN-1001 -> adds red pin (pin-danger) and Danger sign status
    await page.locator('.bottom').getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: /BEN-1001/ }).click();
    await page.getByRole('button', { name: /Emergency/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Show nearest PHC/ }).click();
    await page.getByRole('button', { name: 'Close facility highlight' }).click();
    await expect(page.locator('path.household-pin-BEN-1001.pin-danger')).toHaveCount(1);
    await page.locator('path.household-pin-BEN-1001.pin-danger').dispatchEvent('click');
    await expect(page.locator('.pin-detail')).toContainText('Sunita Patil');
    await expect(page.locator('.pin-detail')).toContainText('Danger sign');
  });
});
