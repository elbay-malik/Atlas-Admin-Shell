import { type Page, expect, test } from '@playwright/test';

const AUDIT_ENTRY = '**/localhost:4203/remoteEntry.json';

/**
 * The error boundary of ADR-0007, exercised against the real federation
 * runtime. The route interception must be installed BEFORE page.goto, because
 * the shell fetches every remoteEntry.json during initFederation at bootstrap.
 */
test.describe('a remote that will not load', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
    await page.route(AUDIT_ENTRY, (route) => route.abort('connectionrefused'));
  });

  /**
   * The boundary auto-retries three times (1s/2s/4s) before handing over to the
   * user. Waiting for it to give up makes the manual-Retry assertions
   * deterministic — otherwise an auto-retry can win the race and the button is
   * gone before the test clicks it.
   */
  async function waitForAutoRetriesToStop(page: Page): Promise<void> {
    await expect(page.getByTestId('remote-retry-status')).toContainText('exhausted', {
      timeout: 20_000,
    });
  }

  test('degrades to the boundary and leaves the rest of the platform working', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('shell-layout')).toBeVisible();

    // seeded from the federation registry, so it reads as unavailable before anyone clicks
    await expect(page.getByTestId('nav-audit-logs')).toHaveAttribute('data-health', 'down');

    // One failure, one name, on all three surfaces that report it.
    await expect(page.getByTestId('nav-audit-logs')).toContainText('unavailable');
    await expect(
      page.locator('[data-testid="overview-remote"][data-remote="audit-logs"]:visible')
    ).toContainText('unavailable');

    await page.click('a[href="/audit"]');
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();
    await expect(page).toHaveURL(/\/unavailable\/audit-logs/);
    await expect(page.getByTestId('remote-unavailable')).toContainText('Audit Logs is unavailable');
    // Which origin to go and check, and never a count of no attempts at all.
    await expect(page.getByTestId('remote-origin')).toHaveText('http://localhost:4203');
    await expect(page.getByTestId('remote-attempts')).not.toHaveText('0');
    await waitForAutoRetriesToStop(page);
    await expect(page.locator('body')).not.toContainText(/\b(offline|unreachable|down)\b/);

    // one bad remote must not take the console down
    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toBeVisible();
    await page.click('a[href="/iam"]');
    await expect(page.locator('iam-home')).toBeVisible();
  });

  test('recovers in-page when the remote comes back, with no reload', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/audit"]');
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();
    await waitForAutoRetriesToStop(page);

    // prove the recovery does not go through a page load
    await page.evaluate(() => ((window as unknown as Record<string, unknown>)['__kept'] = true));

    await page.unroute(AUDIT_ENTRY);
    await page.getByTestId('retry-remote').click();

    await expect(page.locator('audit-home')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/audit$/);
    // the marker survives, so the router recovered without reloading the page —
    // which only works because a REJECTED loadChildren is never cached
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__kept'])).toBe(
      true
    );
  });

  test('records its own outage in the audit trail once that remote is back', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/audit"]');
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();
    await waitForAutoRetriesToStop(page);

    await page.unroute(AUDIT_ENTRY);
    await page.getByTestId('retry-remote').click();
    await expect(page.locator('audit-home')).toBeVisible({ timeout: 20_000 });

    // the shell published remote.unavailable on the bus while the remote was
    // down; the replay buffer hands it to the trail the moment it finally loads
    const outage = page
      .locator('[data-testid="audit-row"]')
      .filter({ hasText: 'remote.unavailable' })
      .first();
    await expect(outage).toContainText('audit-logs');
  });
});
