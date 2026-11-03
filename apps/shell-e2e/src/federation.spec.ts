import { expect, test } from '@playwright/test';

test.describe('federation', () => {
  test('shell loads every remote from the manifest', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('shell-layout')).toBeVisible();

    // viewer-visible remotes render through the runtime import map
    await page.getByRole('button', { name: 'Sign in as admin' }).click();

    await page.click('a[href="/iam"]');
    await expect(page.locator('iam-home')).toContainText('Identity & Access');

    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toContainText('Feature Flags');

    await page.click('a[href="/audit"]');
    await expect(page.locator('audit-home')).toContainText('Audit Logs');
  });

  test('auth context propagates into a remote as a shared singleton', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in as admin' }).click();
    await page.click('a[href="/iam"]');

    // the remote reads the SHELL's AtlasAuth instance — same signal, no re-login
    await expect(page.getByTestId('session-info')).toContainText('ada@atlas.dev');
    await expect(page.getByTestId('session-info')).toContainText('admin');
  });

  test('role gating hides admin-only remotes from viewers', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'as viewer' }).click();

    // In the nav: the Overview's own rows link to their domains as well.
    await expect(page.locator('#primary-nav a[href="/flags"]')).toBeVisible();
    await expect(page.locator('a[href="/iam"]')).toHaveCount(0);
  });

  test('theme toggle flips design tokens at runtime', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('shell-layout')).toBeVisible();
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.click('ui-theme-toggle button');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(!before);
  });
});
