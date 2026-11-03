import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

/**
 * The Storybook axe gate only sees `libs/shared/ui`, because that is where the
 * stories live. Everything an application actually renders — the three remotes'
 * screens, the shell chrome, and any composition of them — had no automated
 * accessibility coverage at all, which is how two WCAG contrast failures reached
 * review in slice 2.
 *
 * These run against the real federated console, so a remote's own markup is
 * checked as the user meets it: loaded across the federation boundary, inside
 * the shell, with real data.
 */
async function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

/** Renders violations with the element, so a failure is actionable from the log. */
function report(violations: Awaited<ReturnType<typeof scan>>['violations']): string {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary}`).join('\n')
    )
    .join('\n\n');
}

/** Signs in and lands on the shell chrome, ready to navigate. */
async function openConsole(page: Page) {
  await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();
}

const REMOTES = [
  { name: 'iam', link: 'a[href="/iam"]', ready: 'iam-home' },
  { name: 'feature flags', link: 'a[href="/flags"]', ready: 'flags-home' },
  { name: 'audit logs', link: 'a[href="/audit"]', ready: 'audit-home' },
];

test.describe('accessibility', () => {
  test('the shell chrome has no WCAG A/AA violations', async ({ page }) => {
    await openConsole(page);
    await expect(page.locator('shell-overview')).toBeVisible();

    const { violations } = await scan(page);
    expect(violations, report(violations)).toEqual([]);
  });

  for (const remote of REMOTES) {
    test(`${remote.name} has no WCAG A/AA violations`, async ({ page }) => {
      await openConsole(page);
      await page.click(remote.link);
      await expect(page.locator(remote.ready)).toBeVisible();

      const { violations } = await scan(page);
      expect(violations, report(violations)).toEqual([]);
    });
  }

  /**
   * A table that only scrolls on a phone is a violation only on a phone: at 390px
   * the audit ledger was a scroller nothing could focus, which the desk-sized scans
   * above cannot see. The wait is for the shape after rows arrive.
   */
  for (const screen of [
    { path: '/audit', ready: 'audit-row' },
    { path: '/iam', ready: 'user-row' },
    { path: '/flags', ready: 'flag-row' },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${screen.path} has no WCAG A/AA violations at phone width in ${theme}`, async ({ page }) => {
        await page.addInitScript((chosen) => {
          localStorage.setItem('atlas.auth.persona', 'admin');
          localStorage.setItem('atlas.theme', chosen);
        }, theme);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(screen.path);
        await expect(page.getByTestId(screen.ready).first()).toBeVisible();
        if (screen.path === '/audit') {
          await expect(page.locator('[data-overflowing]')).toHaveAttribute('tabindex', '0');
        }

        const { violations } = await scan(page);
        expect(violations, report(violations)).toEqual([]);
      });
    }
  }

  test('the open drawer has no WCAG A/AA violations', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('nav-toggle').click();
    await expect(page.locator('#primary-nav')).toBeVisible();

    const { violations } = await scan(page);
    expect(violations, report(violations)).toEqual([]);
  });

  /**
   * The design tokens flip per theme, so a colour can clear AA in light and fail
   * in dark. Slice 2 shipped a 2.57:1 nav link precisely because nothing ever
   * rendered dark mode for axe.
   */
  test('the console is accessible in dark mode too', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('atlas.auth.persona', 'admin');
      localStorage.setItem('atlas.theme', 'dark');
    });
    await page.goto('/');
    await expect(page.locator('shell-layout')).toBeVisible();
    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toBeVisible();

    const { violations } = await scan(page);
    expect(violations, report(violations)).toEqual([]);
  });

  test('the remote error boundary is accessible', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
    await page.route('**/localhost:4203/remoteEntry.json', (route) =>
      route.abort('connectionrefused')
    );
    await page.goto('/');
    await page.click('a[href="/audit"]');
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();

    const { violations } = await scan(page);
    expect(violations, report(violations)).toEqual([]);
  });
});
