import { type Page, expect, test } from '@playwright/test';

/**
 * The filter crosses a boundary unit tests cannot: the remote writes to the shell's
 * router, over federation. So this runs where a wrong injector or a route that
 * remounts on a query change would actually show.
 */
async function openAudit(page: Page, path = '/audit') {
  await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
  await page.goto(path);
  await expect(page.getByTestId('audit-row').first()).toBeVisible();
}

test('the filter reaches the URL and survives a reload', async ({ page }) => {
  await openAudit(page);
  const filter = page.getByTestId('audit-filter');

  await filter.fill('grace');
  await expect(page).toHaveURL(/\/audit\?q=grace$/);
  await expect(page.getByTestId('audit-row')).toHaveCount(1);
  // Typing did not remount the screen and throw the caret away.
  await expect(filter).toBeFocused();

  await page.reload();
  await expect(page.getByTestId('audit-row')).toHaveCount(1);
  await expect(page.getByTestId('audit-filter')).toHaveValue('grace');
});

test('a shared link opens on its filter, and clearing it cleans the URL', async ({ page }) => {
  await openAudit(page, '/audit?q=grace');
  await expect(page.getByTestId('audit-filter')).toHaveValue('grace');
  await expect(page.getByTestId('audit-row')).toHaveCount(1);

  await page.getByTestId('audit-filter').fill('');
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByTestId('audit-row').nth(1)).toBeVisible();
});

test('the filter does not leave a Back entry per keystroke', async ({ page }) => {
  await openAudit(page);
  const before = await page.evaluate(() => history.length);

  await page.getByTestId('audit-filter').pressSequentially('gr', { delay: 400 });
  await expect(page).toHaveURL(/q=gr$/);

  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('results are announced by a region that was already there', async ({ page }) => {
  await openAudit(page);

  const results = page.getByRole('status').and(page.getByTestId('audit-filter-results'));
  await expect(results).toHaveAttribute('aria-live', 'polite');
  await expect(results).toHaveText('');

  await page.getByTestId('audit-filter').fill('grace');
  await expect(results).toHaveText(/^1 of \d+ events matches\.$/);

  await page.getByTestId('audit-filter').fill('no such event');
  await expect(results).toHaveText(/^0 of \d+ events match\.$/);

  await page.getByTestId('audit-filter').fill('');
  await expect(results).toHaveText('');
});

test('a date and the word live both find the rows that show them', async ({ page }) => {
  await openAudit(page);
  const rows = page.getByTestId('audit-row');
  const total = await rows.count();
  const filter = page.getByTestId('audit-filter');

  // The year as the When column prints it, whichever year this runs in.
  const shown = (await rows.first().locator('td').first().textContent())?.trim() ?? '';
  expect(shown).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  await filter.fill(shown.slice(0, 16));
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId('audit-filter-results')).toHaveText(/^[1-9]\d* of \d+ events? match/);

  await filter.fill('live');
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId('audit-live-count')).toHaveText(`0 of ${total} events · 0 live`);
});

test('the badge follows the filter and comes back without it', async ({ page }) => {
  await openAudit(page);
  const badge = page.getByTestId('audit-live-count');
  const total = await page.getByTestId('audit-row').count();
  await expect(badge).toHaveText(`${total} events · 0 live`);

  await page.getByTestId('audit-filter').fill('grace');
  await expect(badge).toHaveText(`1 of ${total} events · 0 live`);

  await page.getByTestId('audit-filter').fill('');
  await expect(badge).toHaveText(`${total} events · 0 live`);
});
