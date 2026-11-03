import AxeBuilder from '@axe-core/playwright';
import { type Page, type Request, expect, test } from '@playwright/test';

/**
 * The demo path (ADR-0015) on the shape it ships on: real auth configured, data on
 * the mock. The provider is faked at the network, at a host that does not resolve,
 * so nothing here reaches a real identity project.
 */

const FIRST_FEDERATED_LOAD = 15_000;
const AUTH_BASE = 'https://identity.test.invalid/v1';
const EXPLORE = 'Explore with demo data (no account)';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const DOMAINS = [
  { path: '/iam', ready: 'iam-home' },
  { path: '/flags', ready: 'flags-home' },
  { path: '/audit', ready: 'audit-home' },
];

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.sig`;
}

async function bootOn(page: Page, overrides: Record<string, unknown>): Promise<void> {
  await page.route('**/federation.manifest.json', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    await route.fulfill({ response, json: { ...manifest, ...overrides } });
  });
}

const REAL_AUTH = { kind: 'nhost', url: AUTH_BASE, provider: 'github' };

/** Answers the token endpoint with a viewer, as the provider would after a redirect. */
async function fakeProvider(page: Page): Promise<void> {
  await page.route(`${AUTH_BASE}/token`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        accessToken: jwt({
          sub: 'real-user',
          exp: Math.floor(Date.now() / 1000) + 900,
          'https://hasura.io/jwt/claims': {
            'x-hasura-allowed-roles': ['user', 'me'],
            'x-hasura-email': 'real@atlas.dev',
          },
        }),
        refreshToken: 'rotated',
      },
    });
  });
}

/** Every request that carries a credential, for as long as the page lives. */
function watchCredentials(page: Page): string[] {
  const credentialed: string[] = [];
  page.on('request', (request) => {
    if (request.headers()['authorization']) credentialed.push(request.url());
  });
  return credentialed;
}

test.describe('with real auth configured and apiMode mock', () => {
  test.beforeEach(async ({ page }) => {
    await bootOn(page, { apiMode: 'mock', auth: REAL_AUTH });
  });

  test('a visitor with no account reaches every remote, labelled on every route', async ({
    page,
  }) => {
    const credentialed: Request[] = [];
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.headers()['authorization']) credentialed.push(request);
      if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await page.getByRole('button', { name: EXPLORE }).click();

    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page.getByTestId('header-demo')).toHaveText('demo');
    await expect(page.getByTestId('overview-demo-running')).toBeVisible();

    for (const { path, ready } of DOMAINS) {
      await page.click(`a[href="${path}"]`);
      await expect(page.locator(ready)).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
      await expect(page.getByTestId('header-demo')).toHaveText('demo');
      await expect(page.getByTestId('header-mock-data')).toHaveText('mock data');
      await expect(page.getByTestId('demo-strip')).toContainText('edge BFF is not exercised');
    }

    expect(credentialed.map((request) => request.url())).toEqual([]);
    expect(apiCalls).toEqual([]);
  });

  test('the audit screen says where its trail lives, and a reload proves it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await page.click('a[href="/iam"]');
    const row = page.locator('[data-testid="user-row"]', { hasText: 'Alan Turing' });
    await row.getByTestId('toggle-active').locator('button').click({ timeout: FIRST_FEDERATED_LOAD });
    await page.click('a[href="/audit"]');

    await expect(page.getByTestId('audit-in-memory')).toContainText(
      'lives in this tab and clears on reload'
    );
    await expect(page.locator('[data-testid="audit-row"]').first()).toContainText('demo@atlas.dev');

    // Nothing is stored, so a reload ends the demo as well as the trail.
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: EXPLORE })).toBeVisible();
  });

  test('exiting returns to the plain signed-out state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await page.click('a[href="/iam"]');
    await expect(page.locator('iam-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

    await page.getByRole('button', { name: 'Exit demo' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('shell-notice')).toHaveText('Demo ended.');
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.getByTestId('demo-strip')).toHaveText('');
    await expect(page.locator('[data-testid="nav-iam"]')).toHaveAttribute('data-allowed', 'false');
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('a real sign-in leaves the demo behind and carries its own role', async ({ page }) => {
    await fakeProvider(page);
    await page.route(`${AUTH_BASE}/signin/provider/**`, (route) => route.fulfill({ status: 204 }));

    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();

    // Offered from inside the demo, and the demo holds while the provider opens.
    const signIn = page.getByTestId('demo-strip').locator('..').getByRole('button');
    await signIn.click();
    await expect(signIn).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('header-demo')).toHaveText('demo');

    // The provider sends the tab back with a token.
    await page.goto('/?refreshToken=from-provider');

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.locator('header').first()).toContainText('viewer');
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: EXPLORE })).toHaveCount(0);
    await expect(page.locator('[data-testid="nav-iam"]')).toHaveAttribute('data-allowed', 'false');
  });

  test('exiting on the failure screen leaves no destination for the next sign-in', async ({ page }) => {
    await page.route('**/remoteEntry.json', (route) =>
      route.request().url().includes(':4201') ? route.abort() : route.continue()
    );
    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await page.click('a[href="/iam"]');
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();

    await page.getByRole('button', { name: 'Exit demo' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('shell-notice')).toHaveText('Demo ended.');
    // Long enough for the boundary's first automatic retry, had it survived.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('shell-notice')).toHaveText('Demo ended.');
    expect(await page.evaluate(() => sessionStorage.getItem('atlas.auth.intended'))).toBeNull();
  });

  test('the failure screen and an unknown route are labelled too, on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/remoteEntry.json', (route) =>
      route.request().url().includes(':4201') ? route.abort() : route.continue()
    );
    const expectLabelled = async () => {
      await expect(page.getByTestId('header-demo')).toBeVisible();
      await expect(page.getByTestId('header-mock-data')).toBeVisible();
      await expect(page.getByTestId('demo-strip')).toContainText('edge BFF is not exercised');
      await expect(page.getByRole('button', { name: 'Exit demo' })).toBeVisible();
    };

    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();

    await page.getByTestId('overview-demo-running').getByRole('link').first().click();
    await expect(page.getByTestId('remote-unavailable')).toBeVisible();
    await expectLabelled();

    await page.evaluate(() => {
      history.pushState({}, '', '/no-such-route');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/no-such-route/);
    await expectLabelled();
  });

  test('a refused redirect leaves a working demo, and nothing of itself behind', async ({ page }) => {
    await page.route(`${AUTH_BASE}/token`, (route) =>
      route.fulfill({ status: 401, headers: CORS, json: {} })
    );
    const credentialed = watchCredentials(page);

    await page.goto('/?refreshToken=refused');
    await expect(page.getByTestId('shell-notice')).toContainText('could not be completed');
    await page.getByRole('button', { name: EXPLORE }).click();
    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
    await expect(page.getByTestId('header-demo')).toHaveText('demo');

    await page.getByRole('button', { name: 'Exit demo' }).click();
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('atlas.auth'))).toBeNull();
    expect(credentialed).toEqual([]);
  });

  test('a demo while the provider sleeps keeps the real session for the next load', async ({
    page,
  }) => {
    let awake = false;
    await fakeProvider(page);
    await page.route(`${AUTH_BASE}/token`, async (route) => {
      if (awake) await route.fallback();
      else await route.fulfill({ status: 503, headers: CORS, json: {} });
    });
    const credentialed = watchCredentials(page);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('atlas.auth', 'stored-session');
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await expect(page.getByTestId('header-demo')).toHaveText('demo');
    await page.getByRole('button', { name: 'Exit demo' }).click();
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('atlas.auth'))).toBe('stored-session');
    expect(credentialed).toEqual([]);

    awake = true;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('button', { name: EXPLORE })).toHaveCount(0);
  });

  test('a real session in a second tab does not reach a demo in the first', async ({
    context,
    page,
  }) => {
    const credentialed = watchCredentials(page);
    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await page.click('a[href="/flags"]');
    await expect(page.locator('flags-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

    const second = await context.newPage();
    await bootOn(second, { apiMode: 'mock', auth: REAL_AUTH });
    await fakeProvider(second);
    await second.goto('/?refreshToken=from-provider');
    await expect(second.getByRole('button', { name: 'Sign out' })).toBeVisible();

    // The first tab holds no session of its own, so it stays what it says it is.
    await expect(page.getByTestId('header-demo')).toHaveText('demo');
    await page.click('a[href="/audit"]');
    await expect(page.locator('audit-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
    await expect(page.getByTestId('header-demo')).toHaveText('demo');
    expect(credentialed).toEqual([]);

    // Its next load finds the stored session, and the demo is gone with the memory.
    await fakeProvider(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
  });

  test('a phone reaches the demo and its label without panning', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await expect(page.getByTestId('header-demo')).toBeVisible();
    await expect(page.getByTestId('demo-strip')).toBeVisible();

    await page.getByTestId('overview-demo-running').getByRole('link').first().click();
    await expect(page.locator('iam-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
    const { doc, viewport } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(doc).toBeLessThanOrEqual(viewport);
  });
});

test.describe('accessibility of the demo states', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no WCAG A/AA violations, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await bootOn(page, { apiMode: 'mock', auth: REAL_AUTH });
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        return violations.map((violation) => violation.id);
      };

      await page.goto('/');
      await expect(page.locator('shell-overview')).toBeVisible();
      expect(await scan()).toEqual([]);

      await page.getByRole('button', { name: EXPLORE }).click();
      await expect(page.getByTestId('header-demo')).toBeVisible();
      expect(await scan()).toEqual([]);

      await page.click('a[href="/audit"]');
      await expect(page.getByTestId('audit-in-memory')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
      expect(await scan()).toEqual([]);
    });
  }
});

test.describe('fail closed', () => {
  test('under apiMode http the demo does not exist', async ({ page }) => {
    await bootOn(page, { apiMode: 'http', auth: REAL_AUTH });

    await page.goto('/iam');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('shell-overview')).toBeVisible();
    await expect(page.getByTestId('overview-demo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: EXPLORE })).toHaveCount(0);
    await expect(page.getByTestId('header-mock-data')).toHaveCount(0);
    await expect(page.getByTestId('shell-notice')).toHaveText('Sign in to open Identity & Access.');
    await expect(page.locator('iam-home')).toHaveCount(0);
  });

  test('an out-of-contract apiMode does not offer it either', async ({ page }) => {
    await bootOn(page, { apiMode: 'HTTP', auth: REAL_AUTH });
    await page.goto('/');
    await expect(page.locator('shell-overview')).toBeVisible();
    await expect(page.getByRole('button', { name: EXPLORE })).toHaveCount(0);
  });

  test('an absent apiMode is mock, so it offers the demo and says mock data', async ({ page }) => {
    // Undefined does not survive JSON, so the manifest served has no apiMode at all.
    await bootOn(page, { apiMode: undefined, auth: REAL_AUTH });
    await page.goto('/');
    await expect(page.getByTestId('header-mock-data')).toHaveText('mock data');
    await expect(page.getByRole('button', { name: EXPLORE })).toBeVisible();
  });

  test('a manifest naming an unknown provider still refuses to boot', async ({ page }) => {
    // Passes the contract, so it keeps its remotes: the dangerous case (ADR-0014).
    await bootOn(page, {
      apiMode: 'mock',
      auth: { kind: 'supabase', url: 'https://p.supabase.co', publishableKey: 'sb_publishable_example' },
    });
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');
    await expect.poll(() => errors.join('\n')).toContain('Refusing to boot');
    await expect(page.locator('shell-overview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: EXPLORE })).toHaveCount(0);
  });

  test('a stored persona never enters the demo', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('atlas.auth.persona', 'admin'));
    await page.goto('/');
    await expect(page.locator('shell-overview')).toBeVisible();
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.locator('header').first()).toContainText('Ada Lovelace');
    await expect(page.getByRole('button', { name: EXPLORE })).toHaveCount(0);
  });
});

test.describe('leftovers in storage', () => {
  test('under real auth a stored persona or demo flag starts nothing', async ({ page }) => {
    await bootOn(page, { apiMode: 'mock', auth: REAL_AUTH });
    await page.addInitScript(() => {
      localStorage.setItem('atlas.auth.persona', 'admin');
      localStorage.setItem('atlas.demo', '1');
      sessionStorage.setItem('atlas.demo', '1');
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: EXPLORE })).toBeVisible();
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    await expect(page.locator('[data-testid="nav-iam"]')).toHaveAttribute('data-allowed', 'false');
  });
});

test.describe('on the local mock personas', () => {
  test('a phone keeps "Sign in" in the name of the persona button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in as admin' })).toBeVisible();
  });

  test('the personas and the demo both work, and the persona ends the demo', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: EXPLORE }).click();
    await expect(page.getByTestId('header-demo')).toHaveText('demo');

    await page.getByRole('button', { name: 'as viewer' }).click();

    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.locator('header').first()).toContainText('Alan Turing');
    await expect(page.getByTestId('demo-strip')).toHaveText('');

    // Signing out of the persona lands on signed out, not back in the demo.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByTestId('header-demo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in as admin' })).toBeVisible();
  });
});
