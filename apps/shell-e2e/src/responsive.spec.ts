import { type Page, expect, test } from '@playwright/test';

/**
 * The console had no responsive behaviour at all: not one breakpoint variant in
 * the workspace and a fixed 15rem sidebar. Measured before this landed, at
 * 390px with content rendered, every route panned sideways — `/` 410px,
 * `/flags` 409px, `/audit` 684px, `/iam` 584px in a 390px viewport. A portfolio
 * link opened on a phone is a confirmed arrival path (PRODUCT.md), so the first
 * thing that visitor did was scroll horizontally.
 *
 * The overflow sweep below is also the symptom gate for a subtler defect it
 * caught: `overflow-x-auto`, added to a REMOTE's template, computed as
 * `visible` in the browser. Tailwind scans the whole workspace, but only the
 * shell's stylesheet is ever loaded — Native Federation ships a remote's chunks,
 * never its CSS — and the shell's build did not list remote sources as inputs,
 * so Nx served a cached stylesheet without the new class. nx.json's
 * `federatedTemplates` fixes the cause; this fails on the symptom whatever the
 * cause turns out to be next time.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
/*
 * `rows` matters as much as `ready`. These stores load asynchronously, so a
 * measurement taken when the component first renders is taken against an empty
 * table — which fits any viewport and makes an overflow assertion pass on a
 * layout that is visibly broken once the data arrives. That false pass happened
 * on this suite's first run.
 */
const ROUTES = [
  { path: '/', ready: 'shell-overview', rows: '[data-testid="overview-remote"]:visible' },
  { path: '/flags', ready: 'flags-home', rows: '[data-testid="flag-row"]' },
  { path: '/audit', ready: 'audit-home', rows: '[data-testid="audit-row"]' },
  { path: '/iam', ready: 'iam-home', rows: '[data-testid="user-row"]' },
];

async function signIn(page: Page) {
  await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
}

test('no route pans sideways at phone width', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);

  const panning: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.locator(route.ready)).toBeVisible();
    await expect(page.locator(route.rows).first()).toBeVisible();

    const { doc, viewport } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    // A dense table may scroll INSIDE its own container; the document may not.
    if (doc > viewport) panning.push(`${route.path}: ${doc}px in a ${viewport}px viewport`);
  }

  expect(panning, panning.join('\n')).toEqual([]);
});

test('the dense tables scroll inside themselves rather than moving the page', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/audit');
  await expect(page.locator('audit-home')).toBeVisible();
  await expect(page.getByTestId('audit-row').first()).toBeVisible();

  // The distinction that makes the sweep above meaningful: there really IS
  // something to scroll here, and it is contained rather than moving the page.
  //
  // Measured on the CONTAINER, not the table. A `w-full` table reports its own
  // scrollWidth as its own width even while its nowrap cells push past the box,
  // so comparing the table against the box reads "it fits" on a table that is
  // visibly clipped — which is exactly what this assertion did on its first run.
  const { clip, scrollable, overhang } = await page.evaluate(() => {
    const table = document.querySelector('audit-home table') as HTMLElement;
    const box = table.parentElement as HTMLElement;
    return {
      clip: getComputedStyle(box).overflowX,
      scrollable: box.scrollWidth > box.clientWidth,
      overhang: box.scrollWidth - box.clientWidth,
    };
  });

  expect(clip, 'the scroll container must actually clip').toBe('auto');
  expect(scrollable, `if nothing overflowed, this test would prove nothing (overhang ${overhang}px)`).toBe(true);
});

test('the sidebar becomes a drawer on a phone and is not tabbable while closed', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();

  const nav = page.locator('#primary-nav');
  const toggle = page.getByTestId('nav-toggle');

  await expect(toggle).toBeVisible();
  // visibility:hidden, not merely translated — a transform alone would leave
  // every nav link in the tab order, off screen.
  await expect(nav).toBeHidden();

  await toggle.click();
  await expect(nav).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('nav-backdrop')).toBeVisible();

  // Escape is what a keyboard user reaches for before hunting back to the
  // toggle, and focus must come back with it.
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('navigating from the drawer closes it, rather than covering the screen it opened', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();

  await page.getByTestId('nav-toggle').click();
  await page.locator('#primary-nav a[href="/flags"]').click();

  await expect(page.locator('flags-home')).toBeVisible();
  await expect(page.locator('#primary-nav')).toBeHidden();
});

test('the desk keeps the sidebar, with no drawer control', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();

  await expect(page.locator('#primary-nav')).toBeVisible();
  await expect(page.getByTestId('nav-toggle')).toBeHidden();
  await expect(page.getByTestId('nav-backdrop')).toHaveCount(0);
});

test('the overview keeps the origin at phone width, where the claim lives', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-overview')).toBeVisible();

  // Five columns is the wrong shape here, but dropping the origin would drop
  // the evidence that each domain is served from somewhere else.
  const rows = page.locator('[data-testid="overview-remote"]:visible');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('http://localhost:4201');
  await expect(rows.first()).toContainText('needs');
});

test('the open drawer takes focus, keeps Tab inside itself and gives focus back', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();

  const toggle = page.getByTestId('nav-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');

  // Opening used to leave focus on the toggle, under the scrim: the focus call ran
  // in a microtask, before the render that made the panel focusable.
  const insideDrawer = () =>
    page.evaluate(() => !!document.activeElement?.closest('#primary-nav'));
  await expect.poll(insideDrawer).toBe(true);
  await expect(page.locator('#primary-nav a[href="/"]')).toBeFocused();

  // Well past the number of stops in the panel, in both directions: it has to wrap
  // rather than reach the header, the content or the browser's own chrome.
  for (let press = 0; press < 12; press++) {
    await page.keyboard.press('Tab');
    expect(await insideDrawer(), `Tab ${press + 1} left the drawer`).toBe(true);
  }
  for (let press = 0; press < 12; press++) {
    await page.keyboard.press('Shift+Tab');
    expect(await insideDrawer(), `Shift+Tab ${press + 1} left the drawer`).toBe(true);
  }

  // Inert, so a screen reader's swipe cannot reach them either.
  await expect(page.getByTestId('console-column')).toHaveJSProperty('inert', true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#primary-nav')).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.getByTestId('console-column')).toHaveJSProperty('inert', false);
});

test('the drawer closes from its own button, and navigating leaves focus on the screen', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();

  const toggle = page.getByTestId('nav-toggle');
  await toggle.click();
  await page.getByTestId('nav-close').click();
  await expect(page.locator('#primary-nav')).toBeHidden();
  await expect(toggle).toBeFocused();

  // Tapping the route already open is a skipped navigation, and still closes it.
  await toggle.click();
  await page.locator('#primary-nav a[href="/"]').click();
  await expect(page.locator('#primary-nav')).toBeHidden();
  await expect(page.locator('#main-content')).toBeFocused();
});

test('widening past md with the drawer open does not leave the console inert', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();

  await page.getByTestId('nav-toggle').click();
  await expect(page.getByTestId('console-column')).toHaveJSProperty('inert', true);

  await page.setViewportSize(DESKTOP);
  await expect(page.getByTestId('console-column')).toHaveJSProperty('inert', false);
  await expect(page.getByTestId('nav-backdrop')).toHaveCount(0);
});

test('every row of /iam keeps its controls on a phone screen', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/iam');
  await expect(page.getByTestId('user-row').first()).toBeVisible();

  // Deactivate used to start beyond the right edge: the table clipped by 142px, with
  // nothing on screen to say a column was there.
  const box = page.getByTestId('user-row').first().locator('xpath=ancestor::*[@data-overflowing]');
  await expect(box).toHaveAttribute('data-overflowing', 'false');

  const rows = page.getByTestId('user-row');
  for (let index = 0; index < (await rows.count()); index++) {
    for (const control of [rows.nth(index).getByTestId('role-select'), rows.nth(index).locator('[data-testid="toggle-active"] button')]) {
      const rect = await control.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(PHONE.width);
    }
  }

  // Block-shaped on screen, still a table to a screen reader.
  await expect(page.getByRole('table')).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(1);
  await expect(rows.first().getByRole('cell').first()).toBeVisible();
});

test('/iam is the same table at a desk', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/iam');
  await expect(page.getByTestId('user-row').first()).toBeVisible();

  const display = await page.getByTestId('user-row').first().evaluate((row) => getComputedStyle(row).display);
  expect(display).toBe('table-row');
  await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
});

/** Scrollable at a phone width, so a keyboard must be able to reach and pan it. */
test('the audit ledger can be panned from the keyboard at phone width', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/audit');
  await expect(page.getByTestId('audit-row').first()).toBeVisible();

  const region = page.getByRole('region', { name: 'Audit events' });
  await expect(region).toHaveAttribute('tabindex', '0');
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test('the ledger is not a tab stop at a desk, where nothing needs panning', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/audit');
  await expect(page.getByTestId('audit-row').first()).toBeVisible();
  await expect(page.locator('[data-overflowing]')).toHaveAttribute('data-overflowing', 'false');
  await expect(page.locator('[data-overflowing]')).not.toHaveAttribute('tabindex', '0');
});

/**
 * Sizes had drifted: 32, 34, 36 and 38px within one screen, while the select and the
 * flag toggle met 44px. Inline links in a sentence are exempt, as in WCAG 2.5.8.
 */
const TOUCH_TARGET = 44;

async function undersizedControls(page: Page): Promise<string[]> {
  return page
    .locator('a[href], button, select, input')
    .evaluateAll(
      (controls, minimum) =>
        controls
          .filter((control) => {
            const style = getComputedStyle(control);
            const rect = control.getBoundingClientRect();
            const shown = style.visibility === 'visible' && rect.width > 1 && rect.height > 1;
            const inline = control.tagName === 'A' && !!control.closest('p');
            return shown && !inline && rect.height < minimum;
          })
          .map((control) => {
            const name =
              control.getAttribute('aria-label') ??
              control.getAttribute('data-testid') ??
              control.textContent?.trim();
            return `${name}: ${Math.round(control.getBoundingClientRect().height)}px`;
          }),
      TOUCH_TARGET
    );
}

test('every control on a phone is a 44px touch target', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(PHONE);

  const undersized: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.locator(route.ready)).toBeVisible();
    await expect(page.locator(route.rows).first()).toBeVisible();
    undersized.push(...(await undersizedControls(page)).map((found) => `${route.path} ${found}`));
  }

  await page.getByTestId('nav-toggle').click();
  await expect(page.locator('#primary-nav')).toBeVisible();
  undersized.push(...(await undersizedControls(page)).map((found) => `drawer ${found}`));

  expect(undersized, undersized.join('\n')).toEqual([]);
});

test('signed out, the header still fits and its controls are 44px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('shell-overview')).toBeVisible();

  const undersized = await undersizedControls(page);
  expect(undersized, undersized.join('\n')).toEqual([]);
  const { doc, viewport } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(doc).toBeLessThanOrEqual(viewport);
});

test('the desk keeps its dense controls', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/iam');
  await expect(page.getByTestId('user-row').first()).toBeVisible();

  const height = await page
    .locator('[data-testid="toggle-active"] button')
    .first()
    .evaluate((button) => button.getBoundingClientRect().height);
  expect(height).toBeLessThan(TOUCH_TARGET);
});
