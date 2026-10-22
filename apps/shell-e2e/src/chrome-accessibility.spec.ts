import { type Page, expect, test } from '@playwright/test';

/**
 * The assistive layer of the shell chrome, over the real federated console.
 *
 * Every assertion here covers something axe-core structurally cannot report:
 * axe has no rule for a missing skip link, none for a missing `aria-current`,
 * none for a document title that never changes, and `label-in-name` only fires
 * when it can pair a visible label with an accessible name it already
 * recognises. The axe suite in accessibility.spec.ts passed with all four of
 * these broken, in both themes, on every screen.
 */

async function signIn(page: Page, route = '/') {
  await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
  await page.goto(route);
  await expect(page.locator('shell-layout')).toBeVisible();
}

test('the skip link is the first tab stop and moves focus into the content', async ({ page }) => {
  await signIn(page);

  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim(),
    href: document.activeElement?.getAttribute('href'),
  }));
  // Before this existed, the first stop was the Overview nav item and a
  // keyboard user walked six chrome stops to reach content on every route.
  expect(first.text).toBe('Skip to content');
  expect(first.href).toBe('#main-content');

  await page.keyboard.press('Enter');

  // Focus must MOVE, not merely scroll — that is what tabindex="-1" on <main>
  // buys, and the difference is the whole point of the control.
  const landed = await page.evaluate(() => document.activeElement?.id);
  expect(landed).toBe('main-content');
});

test('the active route is exposed to assistive tech, not only tinted', async ({ page }) => {
  await signIn(page);

  const current = page.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(/Overview/);

  await page.click('a[href="/flags"]');
  await expect(page.locator('flags-home')).toBeVisible();

  // Exactly one, and it followed the navigation: bound to RouterLinkActive's
  // own isActive, so it cannot disagree with the active styling.
  await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('[aria-current="page"]')).toHaveText(/Feature Flags/);
});

test('every route has its own document title', async ({ page }) => {
  await signIn(page);
  // Was the literal string "shell" on every route, including in production.
  await expect(page).toHaveTitle('Overview · Atlas Admin');

  await page.click('a[href="/flags"]');
  await expect(page.locator('flags-home')).toBeVisible();
  // Sourced from the manifest's displayName, so renaming a domain there
  // renames its tab (ADR-0004).
  await expect(page).toHaveTitle('Feature Flags · Atlas Admin');

  await page.goto('/does-not-exist');
  await expect(page).toHaveTitle('Page not found · Atlas Admin');
});

test('the flag toggle satisfies WCAG 2.5.3 label in name', async ({ page }) => {
  await signIn(page, '/flags');
  await expect(page.locator('flags-home')).toBeVisible();

  const toggle = page.getByTestId('flag-toggle').first();
  const { visible, accessible } = await toggle.evaluate((element) => ({
    visible: (element.textContent ?? '').trim(),
    accessible: element.getAttribute('aria-label') ?? '',
  }));

  // The accessible name used to be "Toggle <key>" while the visible label read
  // "On"/"Off" — speech and screen disagreed, and DESIGN.md's own rule says the
  // aria-label must begin with the visible text.
  expect(visible).toMatch(/^(On|Off)$/);
  expect(accessible.startsWith(visible)).toBe(true);
  expect(accessible).toContain('toggle');
});
