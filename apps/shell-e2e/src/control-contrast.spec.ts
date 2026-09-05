import { type Page, expect, test } from '@playwright/test';
import { failingBoundaries, measureControls, outlinedCount } from './support/contrast';

/**
 * WCAG 1.4.11 (Non-text Contrast) requires 3:1 for the visual boundary that
 * identifies a control. axe-core does NOT automate this rule — verified by
 * reverting a control's border to the weak token and watching the axe suite in
 * accessibility.spec.ts still pass — so it needs its own check.
 *
 * This is the exact class of defect that shipped in slice 2: controls with no
 * fill in their resting state, outlined only in the separator colour, measuring
 * 1.18:1 in light and 1.29:1 in dark.
 */
async function assertBoundaries(page: Page) {
  const measured = await measureControls(page);
  expect(outlinedCount(measured), 'expected outlined controls to measure').toBeGreaterThan(0);
  const failures = failingBoundaries(measured);
  expect(failures, failures.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`control boundaries meet WCAG 1.4.11 in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(
      ([persona, chosen]) => {
        localStorage.setItem('atlas.auth.persona', persona);
        localStorage.setItem('atlas.theme', chosen);
      },
      ['admin', theme]
    );

    await page.goto('/');
    await expect(page.locator('shell-layout')).toBeVisible();
    await assertBoundaries(page);

    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toBeVisible();
    await assertBoundaries(page);

    await page.click('a[href="/audit"]');
    await expect(page.locator('audit-home')).toBeVisible();
    await assertBoundaries(page);
  });
}
