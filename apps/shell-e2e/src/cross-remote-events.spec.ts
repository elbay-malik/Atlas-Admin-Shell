import { expect, test } from '@playwright/test';

/**
 * The payoff of the typed event bus: two remotes that never import each other,
 * communicating through versioned contracts carried by the shell's singleton.
 */
test.describe('cross-remote events', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
  });

  test('a flag toggled in one remote shows up in the audit trail of another', async ({ page }) => {
    await page.goto('/');

    await page.click('a[href="/flags"]');
    const row = page.locator('[data-testid="flag-row"][data-flag-key="bulk-export"]');
    await expect(row).toBeVisible();

    const toggle = row.getByTestId('flag-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // audit-logs is only downloaded now — the event it must show was published
    // before this remote existed in the page, so this also proves bus replay.
    await page.click('a[href="/audit"]');
    const auditRow = page
      .locator('[data-testid="audit-row"]')
      .filter({ hasText: 'bulk-export' })
      .first();
    await expect(auditRow).toContainText('flag.enabled');
    await expect(auditRow).toContainText('ada@atlas.dev');
  });

  test('a role change in IAM reaches the audit trail with its transition', async ({ page }) => {
    await page.goto('/');

    await page.click('a[href="/iam"]');
    const userRow = page.locator('[data-testid="user-row"][data-user-id="u-3"]');
    await expect(userRow).toBeVisible();
    await userRow.getByTestId('role-select').selectOption('admin');

    await page.click('a[href="/audit"]');
    const auditRow = page
      .locator('[data-testid="audit-row"]')
      .filter({ hasText: 'alan@atlas.dev' })
      .first();
    await expect(auditRow).toContainText('user.role.changed');
    await expect(auditRow).toContainText('viewer -> admin');
  });

  test('remote state survives navigating away and back', async ({ page }) => {
    await page.goto('/');

    await page.click('a[href="/flags"]');
    const row = page.locator('[data-testid="flag-row"][data-flag-key="sso-enforced"]');
    await row.getByTestId('flag-toggle').click();
    await expect(row.getByTestId('flag-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.click('a[href="/audit"]');
    await expect(page.locator('audit-home')).toBeVisible();
    await page.click('a[href="/flags"]');

    // the store lives in the remote's lazy route injector, which the router caches
    await expect(
      page
        .locator('[data-testid="flag-row"][data-flag-key="sso-enforced"]')
        .getByTestId('flag-toggle')
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
