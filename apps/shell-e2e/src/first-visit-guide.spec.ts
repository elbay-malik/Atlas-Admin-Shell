import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

/**
 * The first-visit guide, on a visitor who has never dismissed it. Every other
 * suite starts with it dismissed (playwright.config.mts).
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

const PHONE = { width: 360, height: 740 };
const card = (page: Page) => page.getByTestId('guide-card');

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .include('[data-testid="guide-card"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('first-visit guide', () => {
  test('shows on a first visit without taking focus, and passes axe in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript((chosen) => localStorage.setItem('atlas.theme', chosen), theme);
      await page.goto('/');
      await expect(card(page)).toBeVisible();
      await expect(card(page).getByRole('heading', { name: 'What to try' })).toBeVisible();
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      expect(await axe(page), theme).toEqual([]);
    }
  });

  test("Don't show again survives a reload and a new tab", async ({ page, context }) => {
    await page.goto('/');
    await card(page).getByRole('button', { name: "Don't show again" }).click();
    await expect(card(page)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('shell-layout')).toBeVisible();
    await expect(card(page)).toHaveCount(0);

    const other = await context.newPage();
    await other.goto('/');
    await expect(other.locator('shell-layout')).toBeVisible();
    await expect(card(other)).toHaveCount(0);
  });

  test('Close lasts for this tab only', async ({ page, context }) => {
    await page.goto('/');
    await card(page).getByRole('button', { name: 'Close' }).click();
    await page.reload();
    await expect(page.locator('shell-layout')).toBeVisible();
    await expect(card(page)).toHaveCount(0);

    const other = await context.newPage();
    await other.goto('/');
    await expect(card(other)).toBeVisible();
  });

  test('reopens from the nav with focus on it, and Escape closes it', async ({ page }) => {
    await page.goto('/');
    await card(page).getByRole('button', { name: "Don't show again" }).click();

    await page.getByTestId('guide-open').click();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('on a phone it starts as a bar on the Overview only, and reopens from the drawer', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
    await page.goto('/');
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-expanded', 'false');
    const bar = await card(page).boundingBox();
    expect(bar && bar.height <= 80).toBe(true);

    await card(page).getByRole('button', { name: 'What to try' }).click();
    await expect(card(page)).toHaveAttribute('data-expanded', 'true');
    await expect(card(page)).toBeFocused();
    const box = await card(page).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= PHONE.width).toBe(true);
    expect(box && box.height <= PHONE.height / 2 + 1).toBe(true);
    await page.keyboard.press('Escape');

    await page.goto('/flags');
    await expect(page.locator('flags-home')).toBeVisible({ timeout: 15_000 });
    await expect(card(page)).toHaveCount(0);

    await page.getByTestId('nav-toggle').click();
    await page.getByTestId('guide-open').click();
    await expect(page.locator('#primary-nav')).not.toHaveAttribute('role', 'dialog');
    await expect(card(page)).toHaveAttribute('data-expanded', 'true');
    await expect(card(page)).toBeFocused();
  });

  test('starts as the bar on a short laptop screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(card(page)).toHaveAttribute('data-expanded', 'false');
  });

  test('lets the page scroll its last rows out from under the card', async ({ page }) => {
    await page.goto('/');
    await expect(card(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const cardTop = (await card(page).boundingBox())?.y ?? 0;
    const lastRow = await page.locator('main table tbody tr').last().boundingBox();
    expect(lastRow && lastRow.y + lastRow.height <= cardTop).toBe(true);
  });
});
