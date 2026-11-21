import { expect, type Page } from '@playwright/test';

/**
 * Enters the protected /app workspace through the real landing page "Try the live demo" CTA
 * (or reuses the active demo session if already authenticated on /app).
 */
export async function enterAppAsDemo(page: Page) {
  await page.goto('/');
  const openAppLink = page.getByRole('link', { name: 'Open app' });
  if (await openAppLink.isVisible().catch(() => false)) {
    await openAppLink.click();
  } else {
    await page.getByRole('button', { name: /Try the live demo/i }).first().click();
  }
  await page.waitForURL(/\/app/);
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 10_000 });
}
