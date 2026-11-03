import { type Page, expect, test } from '@playwright/test';

/**
 * Geometry nothing else here measured, on the screens three teams would own.
 * The first thing under the header started at 244, 200 and 164px on /iam, /flags
 * and /audit; controls in one row were 30, 33 and 34px; and the Overview's prose
 * ran to 93 characters a line, because `max-w-prose` is 65 of the digit 0, which
 * is wider than an average character of running text.
 */

const FIRST_FEDERATED_LOAD = 30_000;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const SCREENS = [
  { path: '/iam', ready: 'iam-home', rows: '[data-testid="user-row"]' },
  { path: '/flags', ready: 'flags-home', rows: '[data-testid="flag-row"]' },
  { path: '/audit', ready: 'audit-home', rows: '[data-testid="audit-row"]' },
];

async function open(page: Page, screen: (typeof SCREENS)[number]) {
  await page.goto(screen.path);
  await expect(page.locator(screen.ready)).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
  await expect(page.locator(screen.rows).first()).toBeVisible();
}

function persona(page: Page, role: 'admin' | 'viewer') {
  return page.addInitScript((chosen) => localStorage.setItem('atlas.auth.persona', chosen), role);
}

/** The top of whatever follows the screen's header. */
function contentStart(page: Page, ready: string): Promise<number> {
  return page
    .locator(`${ready} ui-page-header + *`)
    .first()
    .evaluate((element) => Math.round(element.getBoundingClientRect().top));
}

test('content starts at one height on every domain screen, for either role', async ({ page }) => {
  await persona(page, 'admin');
  await page.setViewportSize(DESKTOP);

  const starts: Record<string, number> = {};
  for (const screen of SCREENS) {
    await open(page, screen);
    starts[screen.path] = await contentStart(page, screen.ready);
  }
  expect(new Set(Object.values(starts)).size, JSON.stringify(starts)).toBe(1);
});

test('a viewer on /flags, with a note to show, starts at the same height too', async ({ page }) => {
  await persona(page, 'viewer');
  await page.setViewportSize(DESKTOP);

  await open(page, SCREENS[1]);
  const flags = await contentStart(page, 'flags-home');
  await open(page, SCREENS[2]);
  expect(flags).toBe(await contentStart(page, 'audit-home'));
});

test('the silent status region costs the desktop header no height', async ({ page }) => {
  await persona(page, 'admin');
  await page.setViewportSize(DESKTOP);
  await open(page, SCREENS[1]);

  // It sits beside the title block, so it can only be a hole if it outgrows it.
  const { region, titleBlock } = await page.evaluate(() => {
    const bottom = (selector: string) =>
      (document.querySelector(selector) as HTMLElement).getBoundingClientRect().bottom;
    return {
      region: bottom('flags-home [data-testid="action-status"]'),
      titleBlock: bottom('flags-home [data-testid="page-note"]'),
    };
  });
  expect(region).toBeLessThanOrEqual(titleBlock);
});

for (const viewport of [DESKTOP, PHONE]) {
  test(`an arriving message moves nothing at ${viewport.width}px`, async ({ page }) => {
    await persona(page, 'admin');
    await page.setViewportSize(viewport);
    await open(page, SCREENS[1]);

    const row = page.locator('[data-testid="flag-row"][data-flag-key="bulk-export"]');
    const before = (await row.boundingBox())?.y;
    await row.getByTestId('flag-toggle').locator('button').click();
    await expect(page.getByTestId('action-status')).toContainText('bulk-export turned');
    await expect(page.getByTestId('action-status').getByRole('button')).toBeVisible();
    expect((await row.boundingBox())?.y).toBe(before);
  });
}

test('every control in a row is one height at the desk', async ({ page }) => {
  await persona(page, 'admin');
  await page.setViewportSize(DESKTOP);

  const heights: string[] = [];
  for (const screen of SCREENS) {
    await open(page, screen);
    heights.push(
      ...(await page
        .locator(
          'main ui-button button, main select, main input, header ui-button button, ui-theme-toggle button'
        )
        .evaluateAll((controls) =>
          controls.map(
            (control) =>
              `${control.getAttribute('data-testid') ?? control.closest('[data-testid]')?.getAttribute('data-testid') ?? control.textContent?.trim()}: ${control.getBoundingClientRect().height}`
          )
        ))
    );
  }
  const off = heights.filter((entry) => !entry.endsWith(': 36'));
  expect(heights.length).toBeGreaterThan(5);
  expect(off, off.join('\n')).toEqual([]);
});

test('a primary button and a secondary button are the same height', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const buttons = page.locator('header ui-button button');
  await expect(buttons).toHaveCount(2);
  const heights = await buttons.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().height));
  expect(heights).toEqual([36, 36]);
});

test('an unavailable remote keeps its whole name in the nav', async ({ page }) => {
  await persona(page, 'admin');
  await page.setViewportSize(DESKTOP);
  await page.route('**/localhost:4201/remoteEntry.json', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  const item = page.getByTestId('nav-iam');
  await expect(item).toHaveAttribute('data-health', 'down');
  await expect(item).toContainText('unavailable');

  const name = item.locator('.truncate');
  await expect(name).toHaveText('Identity & Access');
  const clipped = await name.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(clipped).toBe(false);
});

/** The detector's own figure: past about 80 characters the eye loses the next line. */
const LONGEST_LINE = 80;

for (const viewport of [DESKTOP, PHONE]) {
  test(`Overview prose keeps a readable measure at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('shell-overview')).toBeVisible();

    const paragraphs = await page.locator('shell-overview p:visible').evaluateAll((elements) =>
      elements.map((element) => {
        // Characters by rendered line, read off the layout rather than the source.
        const byLine = new Map<number, string>();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = node as Text;
          for (let index = 0; index < text.length; index += 1) {
            const range = document.createRange();
            range.setStart(text, index);
            range.setEnd(text, index + 1);
            const rect = range.getClientRects()[0];
            if (!rect) continue;
            const top = Math.round(rect.top);
            byLine.set(top, (byLine.get(top) ?? '') + text.data[index]);
          }
        }
        return {
          lines: [...byLine.values()].map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean),
          wrap: getComputedStyle(element).textWrapStyle,
        };
      })
    );

    expect(paragraphs.length).toBeGreaterThan(2);
    for (const { lines, wrap } of paragraphs) {
      const longest = Math.max(...lines.map((line) => line.length));
      expect(longest, lines.join(' / ')).toBeLessThanOrEqual(LONGEST_LINE);
      expect(wrap).toBe('pretty');
      // No paragraph of several lines ends on a word by itself.
      if (lines.length > 1) {
        expect(lines[lines.length - 1].split(' ').length, lines.join(' / ')).toBeGreaterThan(1);
      }
    }
  });
}
