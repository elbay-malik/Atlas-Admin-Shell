import { expect, test } from '@playwright/test';

/**
 * A control can be present, labelled, contrast-correct and still useless if it
 * renders at the wrong size. Nothing in this repository checked that.
 *
 * The defect this exists for: `max-w-md` silently resolved to 1rem instead of
 * 28rem, because the design tokens aliased a token named `md` into Tailwind's
 * spacing namespace, which `max-w-*` resolves before the container scale. The
 * audit log's filter — correct markup, `<label class="mb-4 block max-w-md">`
 * around a `w-full` input — rendered 26px wide at every viewport for months.
 *
 * Every gate was blind to it. `tokens:check` compares the generated CSS to the
 * JSON and they matched. The design detector has no element-sizing rule. axe
 * does not measure width. Lint and typecheck cannot see rendered geometry. The
 * build guard in `build-tokens.mjs` now rejects the root cause; this rejects the
 * symptom, which is the part a user would actually meet, and does so for any
 * future cause rather than only that one.
 *
 * The floor is deliberately generous. It is not a design opinion about how wide
 * a field should be — it is the width below which a text-entry control cannot
 * show a useful amount of its own value, so crossing it means something is
 * broken rather than merely tight.
 */
const MIN_TEXT_ENTRY_WIDTH = 120;

/** Text entry only. Icon buttons are legitimately ~36px; a 36px search field is not. */
const TEXT_ENTRY = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';

test('no text-entry control collapses below a usable width', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('atlas.auth.persona', 'admin');
    localStorage.setItem('atlas.theme', 'light');
  });

  const routes = [
    { path: '/audit', ready: 'audit-home' },
    { path: '/flags', ready: 'flags-home' },
    { path: '/iam', ready: 'iam-home' },
  ];

  const collapsed: string[] = [];

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.locator(route.ready)).toBeVisible();

    const measured = await page.locator(TEXT_ENTRY).evaluateAll((elements) =>
      elements.map((element) => ({
        label:
          element.getAttribute('data-testid') ??
          element.getAttribute('aria-label') ??
          element.tagName.toLowerCase(),
        width: Math.round(element.getBoundingClientRect().width),
      }))
    );

    for (const control of measured) {
      if (control.width < MIN_TEXT_ENTRY_WIDTH) {
        collapsed.push(
          `${route.path} ${control.label}: ${control.width}px (needs ${MIN_TEXT_ENTRY_WIDTH}px)`
        );
      }
    }
  }

  expect(collapsed, collapsed.join('\n')).toEqual([]);
});

test('the audit filter fills its documented measure', async ({ page }) => {
  // Pins the specific regression: `max-w-md` is 28rem, so at 1440 the field is
  // 448px. Asserting the number rather than "not collapsed" is what would catch
  // the token scale being shadowed again by a different route.
  await page.addInitScript(() => {
    localStorage.setItem('atlas.auth.persona', 'admin');
    localStorage.setItem('atlas.theme', 'light');
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/audit');
  await expect(page.locator('audit-home')).toBeVisible();

  const width = await page
    .getByTestId('audit-filter')
    .evaluate((element) => Math.round(element.getBoundingClientRect().width));

  expect(width, 'max-w-md must resolve to the 28rem container scale, not a spacing token').toBe(
    448
  );
});
