import { type Page, expect, test } from '@playwright/test';
import {
  describeFocusRings,
  failingFocusRings,
  tabThroughFocusRings,
} from './support/contrast';

/**
 * WCAG 2.4.7 Focus Visible is Level A, and until the shared treatment landed
 * this console had no focus style whatsoever — no `:focus-visible` rule and no
 * `outline` declaration anywhere in the workspace. Every control fell back to
 * the user agent's 1px `outline-style: auto` ring.
 *
 * Nothing caught that, and it is worth being precise about why, because the
 * same blind spot would swallow a regression:
 *
 *  - axe-core has NO rule that measures a focus indicator. The axe suite in
 *    accessibility.spec.ts passed with zero focus styling, in both themes, on
 *    every screen.
 *  - The Storybook a11y gate runs the same axe rules, so it could not see it
 *    either — and until this change its stylesheet did not even import the
 *    shared treatment.
 *  - control-contrast.spec.ts measures `borderTopColor` and never focuses
 *    anything, so WCAG 1.4.11 was covered for resting boundaries only.
 *
 * So this file exists because three separate accessibility gates were all
 * structurally incapable of failing on it.
 *
 * It asserts on `outline-style` as well as contrast on purpose. The user
 * agent's own ring would PASS a colour-only check — Chromium's #005fcc
 * measures about 4.6:1 on the light page background — so a gate that only
 * compared colours would have been green before the fix and would stay green if
 * the treatment were deleted. The style and width clauses are what make this
 * test fail without an authored ring.
 */

/** Generous enough to walk the whole chrome plus a screen's controls. */
const STOPS = 40;

async function assertFocusRings(page: Page) {
  const measured = await tabThroughFocusRings(page, STOPS);
  // A walk that focused nothing would otherwise pass vacuously.
  expect(measured.length, 'expected the tab order to reach some controls').toBeGreaterThan(2);
  const failures = failingFocusRings(measured);
  expect(failures, `${failures.join('\n')}\n\nall stops:\n${describeFocusRings(measured)}`).toEqual(
    []
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`every focusable control has an authored focus ring in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(
      ([persona, chosen]) => {
        localStorage.setItem('atlas.auth.persona', persona);
        localStorage.setItem('atlas.theme', chosen);
      },
      ['admin', theme]
    );

    await page.goto('/');
    await expect(page.locator('shell-layout')).toBeVisible();
    await assertFocusRings(page);

    // The flag toggle is a bare <button> that FILLS with brand-primary when
    // pressed — the adjacency a ring drawn without an offset would land on.
    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toBeVisible();
    await assertFocusRings(page);

    // The search field is the only <input> in the console, and the only control
    // at the 0.25rem radius.
    await page.click('a[href="/audit"]');
    await expect(page.locator('audit-home')).toBeVisible();
    await assertFocusRings(page);
  });

  test(`the remote error boundary has an authored focus ring in ${theme} mode`, async ({
    page,
  }) => {
    // The boundary holds the console's only plain anchors — underlined,
    // text-muted, no border. Every other screen is reachable only when the
    // remotes are up, so without this stop that control class would go
    // unverified while the suite stayed green.
    await page.addInitScript(
      ([persona, chosen]) => {
        localStorage.setItem('atlas.auth.persona', persona);
        localStorage.setItem('atlas.theme', chosen);
      },
      ['admin', theme]
    );
    // Installed before goto: the shell fetches every remoteEntry.json during
    // initFederation at bootstrap.
    await page.route('**/localhost:4203/remoteEntry.json', (route) =>
      route.abort('connectionrefused')
    );

    await page.goto('/');
    await page.click('a[href="/audit"]');
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();

    await assertFocusRings(page);
  });
}
