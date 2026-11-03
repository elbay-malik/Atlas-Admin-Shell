import { type Page, type Route, expect, test } from '@playwright/test';

/**
 * What the console does when identity goes wrong. The first half runs on the
 * mock personas. The second half uses the real NhostIdentityClient against a
 * provider faked at the network, because a failed refresh, a provider error and
 * a timeout exist only on that path. Nothing here reaches a real identity
 * project: the host below does not resolve.
 */

const FIRST_FEDERATED_LOAD = 15_000;
const AUTH_BASE = 'https://identity.test.invalid/v1';
const RAW_ID = '3f6c2a10-7d4e-4b8a-9c21-5e0f7a2c91c6';
const NOTICE = 'shell-notice';

const seedPersona = (page: Page, persona: 'admin' | 'viewer') =>
  page.addInitScript((value) => localStorage.setItem('atlas.auth.persona', value), persona);

test.describe('on the mock personas', () => {
  test('the notice is in the DOM and silent before anything happens', async ({ page }) => {
    await page.goto('/');

    const notice = page.getByTestId(NOTICE);
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(notice).toHaveAttribute('aria-live', 'polite');
    await expect(notice).toHaveText('');
    await expect(page.getByTestId('shell-notice-dismiss')).toHaveCount(0);
  });

  test('signing out on /iam leaves the table, and says so', async ({ page }) => {
    await seedPersona(page, 'admin');
    await page.goto('/iam');
    await expect(page.locator('iam-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId(NOTICE)).toHaveText('Signed out.');
    await expect(page.locator('iam-home')).toHaveCount(0);
    await expect(page.locator('shell-overview')).toBeVisible();
  });

  test('after a sign-out there is no write left to make', async ({ page }) => {
    await seedPersona(page, 'admin');
    await page.goto('/iam');
    const row = page.locator('[data-testid="user-row"]', { hasText: 'Alan Turing' });
    await expect(row).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

    // Press Deactivate in the same task as Sign out, before the shell's re-check
    // can take the screen away: the window where the old console reported success.
    const outcome = await page.evaluate(() => {
      const signOut = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Sign out'
      );
      const deactivate = [...document.querySelectorAll<HTMLElement>('[data-testid="user-row"]')]
        .find((candidate) => candidate.textContent?.includes('Alan Turing'))
        ?.querySelector<HTMLButtonElement>('[data-testid="toggle-active"] button');
      signOut?.click();
      deactivate?.click();
      return { pressed: Boolean(signOut && deactivate) };
    });
    expect(outcome.pressed).toBe(true);

    await expect(page.getByTestId(NOTICE)).toHaveText('Signed out.');

    // Sign back in and look: Alan is untouched, and nothing was announced.
    await page.getByRole('button', { name: 'Sign in as admin' }).click();
    await page.click('a[href="/iam"]');
    await expect(row.getByTestId('user-status')).toHaveText('active');
    await expect(page.getByTestId('action-status')).not.toContainText('deactivated');
  });

  test('a viewer sent away from /iam is told why', async ({ page }) => {
    await seedPersona(page, 'viewer');

    await page.goto('/iam');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId(NOTICE)).toHaveText(
      'Identity & Access requires the admin role; you are a viewer.'
    );
  });

  test('a signed-out deep link is remembered across sign-in', async ({ page }) => {
    await page.goto('/iam');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId(NOTICE)).toHaveText(
      'Sign in or explore with demo data to open Identity & Access.'
    );

    await page.getByRole('button', { name: 'Sign in as admin' }).click();

    await expect(page).toHaveURL(/\/iam$/);
    await expect(page.locator('iam-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
    await expect(page.getByTestId(NOTICE)).toHaveText('');
  });

  test('the remembered route still has to be earned', async ({ page }) => {
    await page.goto('/iam');

    await page.getByRole('button', { name: 'as viewer' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId(NOTICE)).toContainText('you are a viewer');
  });

  test('a notice can be dismissed, and focus lands somewhere real', async ({ page }) => {
    await seedPersona(page, 'viewer');
    await page.goto('/iam');
    await expect(page.getByTestId(NOTICE)).not.toHaveText('');

    await page.getByTestId('shell-notice-dismiss').click();

    await expect(page.getByTestId(NOTICE)).toHaveText('');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('the session line says what it proves', async ({ page }) => {
    await seedPersona(page, 'admin');
    await page.goto('/iam');

    const line = page.getByTestId('session-info');
    await expect(line).toContainText('federation boundary', { timeout: FIRST_FEDERATED_LOAD });
    await expect(line).toContainText('ada@atlas.dev');
    await expect(line).toContainText('(admin)');
  });
});

/** An unsigned token: the shell reads claims, and the edge is what verifies them. */
function token(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.sig`;
}

function session(options: { expiresInSeconds?: number; hasura?: Record<string, unknown> } = {}) {
  return {
    accessToken: token({
      sub: RAW_ID,
      exp: Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? 900),
      'https://hasura.io/jwt/claims': {
        'x-hasura-allowed-roles': ['user', 'me', 'admin'],
        ...options.hasura,
      },
    }),
    refreshToken: 'rotated',
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/** Boots the shell on real auth, with the provider answered by `answer`. */
async function withProvider(
  page: Page,
  answer: (route: Route, tokenCall: number) => Promise<void> | void
): Promise<void> {
  await page.route('**/federation.manifest.json', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    await route.fulfill({
      response,
      json: { ...manifest, auth: { kind: 'nhost', url: AUTH_BASE, provider: 'github' } },
    });
  });
  let tokenCalls = 0;
  await page.route(`${AUTH_BASE}/token`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    tokenCalls += 1;
    await answer(route, tokenCalls);
  });
}

const respond = (route: Route, status: number, body: unknown = {}) =>
  route.fulfill({ status, headers: CORS, json: body });

const seedRefreshToken = (page: Page) =>
  page.addInitScript(() => {
    // Only on the first load of this test, so a later reload sees what the app left.
    if (!sessionStorage.getItem('e2e.seeded')) {
      sessionStorage.setItem('e2e.seeded', '1');
      localStorage.setItem('atlas.auth', 'stored-token');
    }
  });

test.describe('on the real client, with a faked provider', () => {
  test('the signed-out overview warns that Nhost may be asleep', async ({ page }) => {
    await withProvider(page, (route) => respond(route, 500));

    await page.goto('/');

    await expect(page.getByTestId('overview-signin-note')).toContainText('free Nhost project');
  });

  test('a provider error shows a notice, leaves the URL, and writes no free text', async ({
    page,
  }) => {
    await withProvider(page, (route) => respond(route, 500));

    await page.goto('/?error=access_denied&errorDescription=Call+555-0100+to+restore+access');

    await expect(page.getByTestId(NOTICE)).toHaveText(
      'Sign-in with GitHub failed: access_denied. Try again.'
    );
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('body')).not.toContainText('555-0100');
  });

  test('a redirect token the provider refuses is reported, not just logged', async ({ page }) => {
    await withProvider(page, (route) => respond(route, 401));

    await page.goto('/?refreshToken=spent');

    await expect(page.getByTestId(NOTICE)).toContainText('could not be completed');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  });

  test('a sleeping provider cannot leave a blank page at boot', async ({ page }) => {
    await seedRefreshToken(page);
    // Never answered, which is what a project waking from sleep looks like.
    await withProvider(page, () => undefined);

    await page.goto('/');

    await expect(page.getByText('Starting the console')).toBeVisible();
    await expect(page.getByTestId(NOTICE)).toContainText('did not answer', { timeout: 15_000 });
    await expect(page.locator('shell-overview')).toBeVisible();
    await expect(page.getByText('Starting the console')).toHaveCount(0);
    // The token was not thrown away, so a reload can still restore the session.
    expect(await page.evaluate(() => localStorage.getItem('atlas.auth'))).toBe('stored-token');
  });

  test('a refresh that fails on /iam ends the session and leaves the route', async ({ page }) => {
    await seedRefreshToken(page);
    // 61s of life puts the refresh at its 5s floor, so this does not take a minute.
    await withProvider(page, (route, call) =>
      call === 1 ? respond(route, 200, session({ expiresInSeconds: 61 })) : respond(route, 401)
    );

    await page.goto('/iam');
    await expect(page.locator('iam-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

    await expect(page.getByTestId(NOTICE)).toHaveText('Your session ended.', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('iam-home')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  });

  test('the sign-in button goes busy and survives the trip to the provider', async ({ page }) => {
    await withProvider(page, (route) => respond(route, 200, session()));
    let redirectTo: string | null = null;
    // A 204 leaves the page on screen, as a provider that is still waking does.
    await page.route(`${AUTH_BASE}/signin/provider/**`, (route) => {
      redirectTo = new URL(route.request().url()).searchParams.get('redirectTo');
      return route.fulfill({ status: 204 });
    });

    await page.goto('/flags');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId(NOTICE)).toHaveText(
      'Sign in or explore with demo data to open Feature Flags.'
    );

    const button = page.locator('header ui-button button');
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveText(/Opening GitHub/);
    await expect(button).toBeEnabled();

    // Our bare origin, the one value the provider's allow-list holds.
    await expect.poll(() => redirectTo).toBe(new URL(page.url()).origin + '/');

    // The provider sends the tab back with a token, and the route is restored.
    await page.goto('/?refreshToken=from-provider');
    await expect(page.locator('flags-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
    await expect(page).toHaveURL(/\/flags$/);
  });

  test('a planted off-site route is never followed after sign-in', async ({ page }) => {
    await page.addInitScript(() =>
      sessionStorage.setItem('atlas.auth.intended', '//evil.example/phish')
    );
    await withProvider(page, (route) => respond(route, 200, session()));

    await page.goto('/?refreshToken=from-provider');

    await expect(page.locator('shell-overview')).toBeVisible();
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
  });

  test.describe('a token with no name and no email', () => {
    test.beforeEach(async ({ page }) => {
      await seedRefreshToken(page);
      await withProvider(page, (route) => respond(route, 200, session()));
    });

    test('the header labels the id, and the keyboard reaches all of it', async ({ page }) => {
      await page.goto('/');

      const identity = page.getByTestId('identity-fallback');
      await expect(identity).toContainText('GitHub account');
      await expect(identity).toContainText('3f6c…91c6');
      await expect(page.locator('header').first()).not.toContainText(RAW_ID);

      await identity.getByTestId('short-id').focus();
      await page.keyboard.press('Enter');
      await expect(identity.getByTestId('short-id-value')).toHaveText(RAW_ID);

      await page.keyboard.press('Escape');
      await expect(identity.getByTestId('short-id-value')).toHaveCount(0);
    });

    test('the session line no longer reads "Session: (admin)"', async ({ page }) => {
      await page.goto('/iam');

      const line = page.getByTestId('session-info');
      await expect(line).toContainText('3f6c…91c6', { timeout: FIRST_FEDERATED_LOAD });
      await expect(line).toContainText('(admin)');
      await expect(line).not.toContainText(RAW_ID);
    });

    test('the audit trail names the id, where it used to be blank', async ({ page }) => {
      await page.goto('/iam');
      const row = page.locator('[data-testid="user-row"]', { hasText: 'Alan Turing' });
      await expect(row).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });

      await row.getByTestId('toggle-active').locator('button').click();
      await expect(page.getByTestId('action-status')).toContainText('Alan Turing deactivated.');

      await page.click('a[href="/audit"]');
      await expect(page.locator('audit-home')).toBeVisible({ timeout: FIRST_FEDERATED_LOAD });
      await expect(page.locator('audit-home tbody tr').first()).toContainText(RAW_ID);
    });
  });
});
