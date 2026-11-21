import { test, expect } from '@playwright/test';

test.describe('Phase 4: Landing page, Auth, Onboarding, Demo entry & Protected routes', () => {
  test('landing page renders all sections, switches EN/HI/MR, toggles FAQ & language chips, and links to Privacy', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Sticky header & 2. Hero
    await expect(page.getByRole('heading', { level: 1, name: /Speak the visit\. We write the record\./ })).toBeVisible();
    await expect(page.getByText('Your Voice. Your Community. Better Healthcare.')).toBeVisible();
    await expect(page.getByText('Simulated preview', { exact: true })).toBeVisible();

    // 3. Trust strip
    await expect(page.getByText(/Prototype · Synthetic data only · Not a medical device · Powered by Gnani Prisma and Timbre voice AI/)).toBeVisible();

    // 4-8. Problem, How it works, Safety, Languages, Field resilience
    await expect(page.getByText('Typing on small screens')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Four calm steps/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Fixed MoHFW danger-sign rules/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Built for Marathi, Hindi, English/ })).toBeVisible();
    await expect(page.getByText(/Voice capture needs an internet connection/)).toBeVisible();

    // Interactive language chip
    await page.getByRole('button', { name: /मराठी \(Marathi\)/ }).click();
    await expect(page.getByText(/आज मी सुनीताची एएनसी भेट घेतली/)).toBeVisible();

    // 9. FAQ accordion
    await page.getByRole('button', { name: 'Does it work offline?' }).click();
    await expect(page.getByText(/Live voice capture \(Gnani Prisma\) requires an internet connection/)).toBeVisible();

    // Switch entire landing page to Hindi and Marathi
    await page.getByLabel('Language', { exact: true }).selectOption('hi');
    await expect(page.getByRole('heading', { level: 1, name: /विज़िट बोलें/ })).toBeVisible();
    await page.getByLabel('Language', { exact: true }).selectOption('mr');
    await expect(page.getByRole('heading', { level: 1, name: /भेट बोला/ })).toBeVisible();
    await page.getByLabel('Language', { exact: true }).selectOption('en');

    // Privacy footer link
    await page.locator('footer').getByRole('link', { name: 'Privacy' }).click();
    await page.waitForURL(/\/privacy/);
    await expect(page.getByRole('heading', { name: /Privacy & Data Handling/ })).toBeVisible();
  });

  test('unauthenticated visit to /app redirects to /login with ?next=%2Fapp', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/login\?next=%2Fapp/);
    await expect(page.getByRole('heading', { name: /Log in to ASHA SAKHI/ })).toBeVisible();
  });

  test('sign-up validates consent & password rules, completes onboarding, persists across reload, logs out and logs back in', async ({ page }) => {
    const uniqueEmail = `asha.worker.${Date.now()}@example.com`;
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /Create worker account/ })).toBeVisible();

    // Attempt submit without consent checkbox -> error
    await page.getByLabel('Display name').fill('Kavita Joshi');
    await page.getByLabel('Email address').fill(uniqueEmail);
    await page.getByLabel('Password', { exact: true }).fill('StrongPass123');
    await page.getByRole('button', { name: 'Create worker account' }).click();
    await expect(page.getByRole('alert')).toContainText(/synthetic demo data/i);

    // Check consent and submit -> redirects to /onboarding
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create worker account' }).click();
    await page.waitForURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: /Set up your worker profile/ })).toBeVisible();

    // Choose area & language and finish onboarding
    await page.getByLabel('Display name').fill('Kavita Joshi');
    await page.getByLabel('Preferred language').selectOption('en');
    await page.getByRole('button', { name: /Save profile & enter workspace/ }).click();
    await page.waitForURL(/\/app/);
    await expect(page.locator('.bottom')).toBeVisible();

    // Session persists across reload
    await page.reload();
    await expect(page.locator('.bottom')).toBeVisible();

    // Open Settings -> shows worker display name & Log out works
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Kavita Joshi')).toBeVisible();
    await page.getByRole('button', { name: /Log out/ }).click();
    await page.waitForURL(/\/login/);

    // Log back in with same credentials
    await page.getByLabel('Email address').fill(uniqueEmail);
    await page.getByLabel('Password', { exact: true }).fill('StrongPass123');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(/\/app/);
    await expect(page.locator('.bottom')).toBeVisible();
  });

  test('forgot password shows check-email confirmation with rate-limit-aware resend', async ({ page }) => {
    await page.goto('/forgot');
    await expect(page.getByRole('heading', { name: /Reset your password/ })).toBeVisible();
    await page.getByLabel('Email address').fill('worker@example.com');
    await page.getByRole('button', { name: /Send reset link/ }).click();
    await expect(page.getByRole('heading', { name: /Check your email/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend available in/ })).toBeDisabled();
  });

  test('zero-friction anonymous demo entry shows Demo session banner and supports account deletion', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Try the live demo/i }).first().click();
    await page.waitForURL(/\/app/);
    await expect(page.getByText('Demo session')).toBeVisible();
    await expect(page.getByRole('link', { name: /Create an account to keep your data/ })).toBeVisible();

    // Settings -> Delete account confirmation returns to landing page
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Delete account/ }).click();
    await page.getByRole('button', { name: /Yes, delete account/ }).click();
    await page.waitForURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /Speak the visit/ })).toBeVisible();
  });
});
