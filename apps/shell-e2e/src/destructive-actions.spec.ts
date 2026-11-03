import { type Page, expect, test } from '@playwright/test';

/**
 * The two destructive actions in this product — toggling a feature flag and
 * deactivating a user — used to produce no confirmation, no toast, and no
 * announcement of any kind. `[role=status]`, `[aria-live]` and `[role=alert]`
 * were all empty on every domain screen, before and after acting. The only
 * feedback was a label flipping and a counter changing at the opposite corner
 * of the screen, and a screen-reader user got nothing at all.
 *
 * Undo rather than a confirm dialog: a confirm interrupts every action to guard
 * against the rare one, and an operator working through a list learns to
 * dismiss it unread.
 */

/**
 * `ready` gets a longer timeout than a DOM assertion deserves, because it is not
 * one: deep-linking straight to a domain means fetching that remote's
 * remoteEntry.json and its chunks from another origin before anything renders.
 * The default 5s is enough once the servers are warm and not on the first hit
 * of a run, which showed up here as a flake in exactly one test — the first one
 * to touch /flags.
 */
const FIRST_FEDERATED_LOAD = 15_000;

async function open(page: Page, route: string, ready: string, rows: string) {
  await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
  await page.goto(route);
  await expect(page.locator(ready)).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
  await expect(page.locator(rows).first()).toBeVisible();
}

test('the live region exists before anything happens, so it can be announced', async ({ page }) => {
  await open(page, '/flags', 'flags-home', '[data-testid="flag-row"]');

  // The subtle part: a region inserted at the same moment its text appears is
  // frequently never announced. It must already be in the tree, and silent.
  const region = page.getByTestId('action-status');
  await expect(region).toHaveAttribute('role', 'status');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await expect(region).toHaveText('');
});

test('toggling a flag is announced, and can be undone', async ({ page }) => {
  await open(page, '/flags', 'flags-home', '[data-testid="flag-row"]');

  const toggle = page.getByTestId('flag-toggle').first();
  const before = (await toggle.textContent())?.trim();
  const key = await page
    .locator('[data-testid="flag-row"]')
    .first()
    .getAttribute('data-flag-key');

  await toggle.click();
  const region = page.getByTestId('action-status');
  await expect(region).toContainText(`${key} turned`);
  await expect(toggle).not.toHaveText(before ?? '');

  await region.getByRole('button', { name: /Undo/ }).click();

  // Back where it started, and the offer is withdrawn rather than left stale.
  await expect(toggle).toHaveText(new RegExp(before ?? ''));
});

test('an administrator cannot demote or deactivate themselves', async ({ page }) => {
  await open(page, '/iam', 'iam-home', '[data-testid="user-row"]');

  // The signed-in persona is Ada, and she is the first row.
  const self = page.locator('[data-testid="user-row"]').first();
  await expect(self).toContainText('Ada Lovelace');

  await expect(self.getByTestId('role-select')).toBeDisabled();
  // Written out beside the control: a tooltip on a disabled control is out of
  // reach of a keyboard or a touch screen.
  await expect(self.getByTestId('role-refusal')).toBeVisible();
  await expect(self.getByTestId('role-refusal')).toContainText('your own admin role');

  const deactivate = self.getByTestId('toggle-active');
  await expect(deactivate.locator('button')).toBeDisabled();
  await expect(self.getByTestId('active-refusal')).toBeVisible();
  await expect(self.getByTestId('active-refusal')).toContainText('signed in with');
  // …and in the accessible name, so it travels with the control in a rotor.
  await expect(deactivate.locator('button')).toHaveAttribute('aria-label', /signed in with/);
});

test('another administrator stays changeable while a second one remains', async ({ page }) => {
  await open(page, '/iam', 'iam-home', '[data-testid="user-row"]');

  // Without this the previous test would pass on a screen where everything is
  // disabled, which would be a different bug wearing the same green tick.
  const other = page.locator('[data-testid="user-row"]', { hasText: 'Grace Hopper' });
  await expect(other.getByTestId('role-select')).toBeEnabled();
  await expect(other.getByTestId('toggle-active').locator('button')).toBeEnabled();
});

test('deactivating a user is announced, and can be undone', async ({ page }) => {
  await open(page, '/iam', 'iam-home', '[data-testid="user-row"]');

  const row = page.locator('[data-testid="user-row"]', { hasText: 'Alan Turing' });
  await row.getByTestId('toggle-active').locator('button').click();

  const region = page.getByTestId('action-status');
  await expect(region).toContainText('Alan Turing deactivated.');
  await expect(row.getByTestId('user-status')).toHaveText('disabled');

  await region.getByRole('button', { name: /Undo/ }).click();
  await expect(row.getByTestId('user-status')).toHaveText('active');
});

test('Undo hands focus back to the row and stops being offered', async ({ page }) => {
  await open(page, '/iam', 'iam-home', '[data-testid="user-row"]');

  const row = page.locator('[data-testid="user-row"]', { hasText: 'Alan Turing' });
  const toggle = row.getByTestId('toggle-active').locator('button');
  await toggle.click();

  const region = page.getByTestId('action-status');
  const undo = region.getByRole('button', { name: /Undo/ });
  await undo.focus();
  await page.keyboard.press('Enter');

  await expect(toggle).toBeFocused();
  await expect(region).toContainText('Undone: Alan Turing deactivated.');
  await expect(undo).toHaveCount(0);
  await expect(page.getByTestId('action-status-undo-slot')).toBeAttached();
});

test('the header and the refusals agree once an administrator is deactivated', async ({ page }) => {
  await open(page, '/iam', 'iam-home', '[data-testid="user-row"]');
  await expect(page.getByTestId('admin-count')).toHaveText('2 active admins');

  const grace = page.locator('[data-testid="user-row"]', { hasText: 'Grace Hopper' });
  await grace.getByTestId('toggle-active').locator('button').click();

  await expect(page.getByTestId('admin-count')).toHaveText('1 active admin');
  await expect(grace.getByTestId('role-select')).toBeEnabled();
  await expect(grace).not.toContainText('last administrator');
});

test('a second change says it took over from the first Undo', async ({ page }) => {
  await open(page, '/iam', 'iam-home', '[data-testid="user-row"]');

  const alan = page.locator('[data-testid="user-row"]', { hasText: 'Alan Turing' });
  const katherine = page.locator('[data-testid="user-row"]', { hasText: 'Katherine Johnson' });
  await alan.getByTestId('toggle-active').locator('button').click();
  await expect(page.getByTestId('action-status')).toContainText('Alan Turing deactivated.');
  await katherine.getByTestId('toggle-active').locator('button').click();

  await expect(page.getByTestId('action-status-superseded')).toHaveText(
    '"Alan Turing deactivated" can no longer be undone here; reverse it in its row.'
  );
});

test('a flag that reaches every tenant asks first, and a smaller one does not', async ({ page }) => {
  await open(page, '/flags', 'flags-home', '[data-testid="flag-row"]');

  const sso = page.locator('[data-testid="flag-row"][data-flag-key="sso-enforced"]');
  const toggle = sso.getByTestId('flag-toggle');
  await toggle.click();

  await expect(sso.getByTestId('flag-confirm')).toContainText('every tenant');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(sso.getByTestId('flag-confirm-cancel').locator('button')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sso.getByTestId('flag-confirm')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await sso.getByTestId('flag-confirm-commit').locator('button').click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('action-status')).toContainText('sso-enforced turned on.');

  const bulk = page.locator('[data-testid="flag-row"][data-flag-key="bulk-export"]');
  await bulk.getByTestId('flag-toggle').click();
  await expect(bulk.getByTestId('flag-confirm')).toHaveCount(0);
  await expect(bulk.getByTestId('flag-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('a viewer reads why flags are locked, without hovering anything', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'viewer'));
  await page.goto('/flags');
  await expect(page.locator('flags-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

  await expect(page.getByTestId('flags-readonly-reason')).toBeVisible();
  await expect(page.getByTestId('flag-toggle').first()).toHaveAttribute(
    'aria-describedby',
    'flags-readonly-reason'
  );
});
