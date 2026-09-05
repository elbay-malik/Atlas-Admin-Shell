import { expect, test } from '@playwright/test';

/**
 * Role gating runs in `canMatch`, so a forbidden remote is never downloaded —
 * these tests deep-link straight at the URL rather than clicking nav.
 */
test.describe('role-gated deep links', () => {
  test('a viewer deep-linking to an admin-only remote lands on the overview', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'viewer'));

    await page.goto('/iam');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('shell-overview')).toBeVisible();
    await expect(page.locator('a[href="/iam"]')).toHaveCount(0);
  });

  test('an admin deep-linking to the same remote gets it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));

    await page.goto('/iam');

    await expect(page.locator('iam-home')).toBeVisible();
    await expect(page.getByTestId('session-info')).toContainText('ada@atlas.dev');
  });

  test('a viewer keeps the remotes they are allowed to see', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'viewer'));

    await page.goto('/flags');

    await expect(page.locator('flags-home')).toBeVisible();
  });

  test('an anonymous visitor is sent back to the overview', async ({ page }) => {
    await page.goto('/flags');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('shell-overview')).toBeVisible();
  });
});
