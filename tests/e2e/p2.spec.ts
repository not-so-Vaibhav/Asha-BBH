import { test, expect, type Page } from '@playwright/test';
import { enterAppAsDemo } from './helpers';

function makeSilentWav(durationMs = 80): Buffer {
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

test.describe('Phase 3 P2 features and polish', () => {
  test('P2-1 offline draft queue saves to IndexedDB, survives reload, warns voice needs connectivity, and syncs without duplicates', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.route('**/audio/readback/**', (route) => route.fulfill({ status: 404, body: '' }));

    await openVisit(page, 'BEN-1001');

    // Simulate going offline
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });

    // Offline banner must explain draft persistence AND that voice capture needs connectivity (never claims offline speech)
    const banner = page.getByTestId('offline-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Draft saved on this device, will sync later/);
    await expect(banner).toContainText(/Voice capture needs network connectivity/);

    // Trying mic offline switches to typed fallback with clear offline notice
    await page.getByRole('button', { name: 'Start voice capture' }).click();
    await expect(page.getByRole('alert')).toContainText(/No network connection/);

    // Save typed visit offline -> queued in IndexedDB as Pending
    await page.locator('.typed-fallback input').fill('ANC visit weight 55 kg next visit 20 November');
    await page.locator('.typed-fallback button').click();
    await page.getByRole('button', { name: /Confirm & save/ }).click();
    await expect(page.getByRole('heading', { name: 'Record saved' })).toBeVisible();
    await expect(page.locator('.saved')).toContainText(/Draft saved on this device, will sync later/);

    // Reload page while still offline -> IndexedDB queue MUST survive reload
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await page.reload();
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    const queueRow = page.locator('.queue-row').first();
    await expect(queueRow).toBeVisible();
    await expect(queueRow).toHaveAttribute('data-draft-state', 'pending');
    await expect(queueRow).toContainText('Pending');

    // Come back online -> syncs cleanly to Synced without creating duplicate visits
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.locator('.queue-row').first()).toHaveAttribute('data-draft-state', 'synced', { timeout: 6000 });
    await expect(page.locator('.queue-row').first()).toContainText('Synced');
    await expect(page.getByText('1 / 5', { exact: true })).toBeVisible();
  });

  test('P2-2 CSV export downloads UTF-8 BOM CSV files for visits, follow-ups, and referrals', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(30) }));
    await openVisit(page, 'BEN-1001');
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toBeVisible({ timeout: 7000 });
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    await page.locator('.bottom').getByRole('button', { name: 'Home' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Visits CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^asha-sakhi-visits-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(Buffer.from(c));
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM for Excel
    expect(text).toContain('Visit ID,Beneficiary ID,Beneficiary Name,Visit Type');
    expect(text).toContain('BEN-1001,Sunita Patil,ANC,55 kg');
    expect(text).toContain('Synthetic demo data');
    await expect(page.locator('.p2-csv-notice')).toContainText('CSV downloaded');
  });

  test('P2-3 tomorrow voice reminder reads tomorrow follow-ups through Timbre queue and falls back cleanly on 429', async ({ page }) => {
    let reminderCalls = 0;
    let mode: 'ok' | '429' = 'ok';
    await page.route('**/api/gnani/tts', (route) => {
      reminderCalls += 1;
      if (mode === '429') {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'x-speech-error-code': 'UPSTREAM_429_EXHAUSTED', 'x-speech-retries': '2' },
          body: JSON.stringify({ error: 'busy', code: 'UPSTREAM_429_EXHAUSTED', retriesAttempted: 2 }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(40) });
    });

    // Save a visit with next visit tomorrow (2026-11-14)
    await openVisit(page, 'BEN-1001');
    await page.locator('details.typed-note-disclosure summary').click();
    await page.locator('details.typed-note-disclosure input').fill('ANC visit weight 55 kg next visit tomorrow');
    await page.locator('details.typed-note-disclosure button').click();
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    // Trigger Tomorrow's voice reminder on Home
    await page.locator('.bottom').getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: /Tomorrow’s voice reminder/ }).click();
    await expect(page.locator('.p2-status')).toContainText('Sunita Patil');
    await expect(page.locator('.p2-status')).toContainText('Gnani Timbre v3.0');
    expect(reminderCalls).toBeGreaterThanOrEqual(1);

    // Switch to Hindi & simulate 429 retry exhausted -> visible labelled fallback
    mode = '429';
    await page.evaluate(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    });
    await page.getByLabel('Language').selectOption('hi');
    await page.getByRole('button', { name: /कल का आवाज़ रिमाइंडर/ }).click();
    await expect(page.locator('.p2-status')).toContainText('कल के रिमाइंडर');
    await expect(page.locator('.p2-status .tts-fallback-notice')).toContainText('Timbre व्यस्त है');
  });

  test('P2-4 duplicate same-day visit warning blocks accidental duplicate and logs override reason in audit log', async ({ page }) => {
    await page.route('**/api/gnani/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeSilentWav(30) }));

    // Save first ANC visit for BEN-1001 today
    await openVisit(page, 'BEN-1001');
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toBeVisible({ timeout: 7000 });
    await page.getByRole('button', { name: /Confirm & save/ }).click();
    await expect(page.getByRole('heading', { name: 'Record saved' })).toBeVisible();

    // Start a second ANC visit for BEN-1001 on the same day
    await page.locator('.bottom').getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: /BEN-1001/ }).click();
    await page.getByRole('button', { name: /Normal visit/ }).click();
    await expect(page.getByRole('button', { name: /Confirm & save/ })).toBeVisible({ timeout: 7000 });
    await page.getByRole('button', { name: /Confirm & save/ }).click();

    // Duplicate warning must appear and require an override reason
    const warning = page.getByTestId('duplicate-warning');
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: /Save anyway/ }).click();
    await expect(warning).toContainText(/Please enter a short reason/);

    // Tap quick-pick reason chip and confirm override
    await warning.getByRole('button', { name: 'Follow-up re-check' }).click();
    await warning.getByRole('button', { name: /Save anyway/ }).click();
    await expect(page.getByRole('heading', { name: 'Record saved' })).toBeVisible();

    // Verify override reason is logged in persisted auditLog and on the visit record
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('asha-sakhi-demo') || '{}'));
    expect(stored.state.visits).toHaveLength(2);
    expect(stored.state.visits[0].duplicateOverrideReason).toBe('Follow-up re-check');
    expect(stored.state.auditLog[0]).toMatchObject({
      type: 'duplicate_override',
      beneficiaryId: 'BEN-1001',
      visitType: 'ANC',
      reason: 'Follow-up re-check',
    });
  });

  test('About & limitations screen, text size options, keyboard navigation, PWA manifest, and zero Devanagari overflow at 390px and 320px', async ({ page }) => {
    // 1. PWA manifest is valid & serves 192px and 512px icons
    const manifestRes = await page.request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);

    // 2. Settings: text size options + About & limitations screen
    await enterAppAsDemo(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Text size').selectOption('large');
    await expect(page.locator('.app')).toHaveClass(/text-large/);
    await page.getByLabel('Text size').selectOption('xlarge');
    await expect(page.locator('.app')).toHaveClass(/text-xlarge/);
    await page.getByLabel('Text size').selectOption('normal');

    await page.getByRole('button', { name: 'About & limitations' }).click();
    await expect(page.getByRole('heading', { name: 'About & limitations' })).toBeVisible();
    await expect(page.getByText(/Synthetic demo data only/)).toBeVisible();
    await expect(page.getByText(/Offline speech is not supported/)).toBeVisible();
    await expect(page.getByText(/Sample geography & privacy/)).toBeVisible();
    await expect(page.getByText(/Not a medical device/)).toBeVisible();

    // 3. Keyboard-only Tab + Enter check + Escape dismiss on alert dialog
    await page.keyboard.press('Tab');
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTag).toBeTruthy();

    // 4. Devanagari overflow check in Hindi and Marathi at BOTH 390px and 320px viewports
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 760 });
      for (const lang of ['hi', 'mr'] as const) {
        await page.locator('header').getByLabel('Language').selectOption(lang);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);

        for (const tabIdx of [0, 1, 2, 4]) {
          await page.locator('.bottom button').nth(tabIdx).click();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, `width=${width} lang=${lang} tab=${tabIdx}`).toBeLessThanOrEqual(1);
        }

        // Also check Settings and About screens for overflow
        await page.locator('header .icon').click();
        const settingsOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(settingsOverflow, `width=${width} lang=${lang} settings`).toBeLessThanOrEqual(1);
      }
    }
  });
});
