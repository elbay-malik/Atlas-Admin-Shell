import { type Page, expect, test } from '@playwright/test';

/**
 * The Overview is a rendering of federation.manifest.json, so these assertions
 * compare the screen against the manifest the shell actually booted from rather
 * than against hard-coded copy. A remote added to the manifest appears here with
 * no change to this file — which is the property ADR-0004 claims, tested.
 *
 * It exists because the landing screen used to be two sentences over an empty
 * page, identical signed out, as admin and as viewer. PRODUCT.md calls this the
 * highest-weight surface and Principle 1 is "architecture must be visible, not
 * just claimed"; nothing verified either.
 */

/*
 * The overview renders two presentations of one list — a table at md and up,
 * stacked blocks below it — so every locator here is scoped to `:visible`.
 * Counting both would double every expectation and hide which one is broken.
 */
interface Manifest {
  remotes: Record<string, { displayName: string; route: string; url: string; requiredRole: string }>;
}

async function manifest(page: Page): Promise<Manifest> {
  const response = await page.request.get('/federation.manifest.json');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function open(page: Page, persona: string | null) {
  if (persona) {
    await page.addInitScript(
      (value) => localStorage.setItem('atlas.auth.persona', value),
      persona
    );
  }
  await page.goto('/');
  await expect(page.locator('shell-layout')).toBeVisible();
}

test('the overview lists every remote in the manifest, with its origin and role', async ({
  page,
}) => {
  await open(page, 'admin');
  const { remotes } = await manifest(page);
  const names = Object.keys(remotes);
  expect(names.length, 'the fixture manifest must declare remotes').toBeGreaterThan(0);

  await expect(page.locator('[data-testid="overview-remote"]:visible')).toHaveCount(names.length);

  for (const [name, def] of Object.entries(remotes)) {
    const row = page.locator(`[data-testid="overview-remote"][data-remote="${name}"]:visible`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(def.displayName);
    await expect(row).toContainText(`/${def.route}`);
    await expect(row).toContainText(def.requiredRole);
    // The origin is the claim: each domain is served from somewhere else.
    await expect(row).toContainText(new URL(def.url).origin);
  }
});

test('the registry is visible before signing in, because it is fetched before auth', async ({
  page,
}) => {
  await open(page, null);
  const { remotes } = await manifest(page);

  // Signed out, this screen used to show nothing at all and the sidebar was
  // empty under copy telling the visitor to pick a domain from it.
  await expect(page.locator('[data-testid="overview-remote"]:visible')).toHaveCount(Object.keys(remotes).length);
  await expect(page.getByTestId('overview-signed-out')).toBeVisible();
});

test('the overview counts the shell and its remotes, not "origins"', async ({ page }) => {
  await open(page, null);
  const count = Object.keys((await manifest(page)).remotes).length;

  await expect(page.locator('shell-overview header')).toContainText(
    `from a shell and ${count} independently deployed remotes`
  );
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`"resolved" is explained in visible text at ${width}px, not only in a title`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page, 'admin');

    const note = page.getByTestId('overview-state-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText("resolved: the remote's entry file was fetched at boot");
  });
}

test('the Nhost wake note stays away from a deployment on the mock', async ({ page }) => {
  await open(page, null);

  await expect(page.getByTestId('overview-signed-out')).toBeVisible();
  await expect(page.getByTestId('overview-signin-note')).toHaveCount(0);
});

test('every domain appears in the nav; the ones you may not open are disabled', async ({
  page,
}) => {
  await open(page, 'viewer');
  const { remotes } = await manifest(page);

  // Partitioned up front rather than branching inside the loop: a viewer
  // satisfies 'viewer' only, so everything else is forbidden-but-listed.
  const entries = Object.entries(remotes);
  const reachable = entries.filter(([, def]) => def.requiredRole === 'viewer');
  const forbidden = entries.filter(([, def]) => def.requiredRole !== 'viewer');
  expect(forbidden.length, 'the fixture needs an admin-only remote to be meaningful').toBeGreaterThan(0);

  for (const [name] of reachable) {
    const item = page.locator(`[data-testid="nav-${name}"] a`);
    await expect(item, `${name} must be listed`).toHaveCount(1);
    await expect(item).toHaveAttribute('aria-disabled', 'false');
  }

  for (const [name, def] of forbidden) {
    const item = page.locator(`[data-testid="nav-${name}"] a`);
    await expect(item, `${name} must be listed, not hidden`).toHaveCount(1);
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    // It wears the role it needs, so the reason is on screen.
    await expect(item).toContainText(def.requiredRole);
    // No href: it announces the domain rather than being a link that bounces.
    await expect(item).not.toHaveAttribute('href', /./);
  }
});

test('the module state reflects what federation actually did', async ({ page }) => {
  await open(page, 'admin');

  // At rest every reachable remote is "resolved": its remoteEntry.json was
  // fetched during initFederation, but its code has not been imported yet.
  // That distinction is the lazy-loading story, visible without a failure.
  const flags = page.locator('[data-testid="overview-remote"][data-remote="feature-flags"]:visible');
  await expect(flags).toContainText('resolved');

  await page.click('a[href="/flags"]');
  await expect(page.locator('flags-home')).toBeVisible();
  await page.click('a[href="/"]');
  await expect(page.locator('shell-overview')).toBeVisible();

  // Having visited it, the module is now loaded in this page.
  await expect(flags).toContainText('loaded');
  await expect(flags).toHaveAttribute('data-state', 'ready');
});

test('the nav renders drawn icons, not text glyphs', async ({ page }) => {
  await open(page, 'admin');

  const icons = page.locator('nav a svg');
  await expect(icons).toHaveCount(await page.locator('nav a').count());

  // The emoji were the only place colour arrived without carrying state.
  // currentColor is what keeps an icon inside the colour ration.
  await expect(icons.first()).toHaveAttribute('stroke', 'currentColor');

  const glyphs = await page.evaluate(
    () => (document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length
  );
  expect(glyphs, 'no emoji or symbol glyphs may remain in the chrome').toBe(0);
});
