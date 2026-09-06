import { expect, test } from '@playwright/test';

/**
 * Exercises the REAL edge Worker over HTTP: `wrangler dev` runs the dev entry,
 * which trusts the mock auth's fake token so the boundary can be driven with no
 * identity provider.
 *
 * Scope, stated honestly: these assert the API boundary itself — status codes,
 * role enforcement, and that state is genuinely server-held. They deliberately
 * do NOT drive the federated remote UIs. Loading three remotes through a cold
 * `wrangler dev` while Nx is still building them proved flaky in a way that
 * reflected the harness rather than the product, and the main federation suite
 * already covers those screens against static servers. The Angular side of the
 * call — the interceptor, the HTTP API implementations and the shared mode
 * token — is covered by unit tests.
 */
const ADMIN = { authorization: 'Bearer mock.u-admin.admin' };
const VIEWER = { authorization: 'Bearer mock.u-viewer.viewer' };

test.describe('the edge BFF over HTTP', () => {
  test('refuses an unauthenticated call', async ({ request }) => {
    const response = await request.get('/api/flags');
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('answers an unknown API path with JSON, never the SPA fallback', async ({ request }) => {
    const response = await request.get('/api/nope');
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('serves the shell for a normal path, so the Worker has not swallowed the app', async ({
    request,
  }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  });

  test('lets a viewer read flags', async ({ request }) => {
    const response = await request.get('/api/flags', { headers: VIEWER });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { flags: { key: string }[] };
    expect(body.flags.length).toBeGreaterThan(0);
  });

  test('refuses a viewer the IAM directory', async ({ request }) => {
    const response = await request.get('/api/iam/users', { headers: VIEWER });
    expect(response.status()).toBe(403);
  });

  /**
   * The hole this slice closed. The flags UI hides the control from a viewer,
   * but that is not what makes it safe — this request bypasses the UI entirely.
   */
  test('refuses a viewer a flag write, which the UI alone could not', async ({ request }) => {
    const response = await request.patch('/api/flags/sso-enforced', {
      headers: VIEWER,
      data: { enabled: true },
    });
    expect(response.status()).toBe(403);

    const after = await (await request.get('/api/flags', { headers: ADMIN })).json();
    expect(
      (after as { flags: { key: string; enabled: boolean }[] }).flags.find(
        (f) => f.key === 'sso-enforced'
      )?.enabled
    ).toBe(false);
  });

  test('accepts an admin write and holds it server-side', async ({ request }) => {
    const read = async () => {
      const body = (await (await request.get('/api/flags', { headers: ADMIN })).json()) as {
        flags: { key: string; enabled: boolean }[];
      };
      return body.flags.find((f) => f.key === 'bulk-export')?.enabled;
    };

    const before = await read();
    const want = !before;

    const response = await request.patch('/api/flags/bulk-export', {
      headers: ADMIN,
      data: { enabled: want },
    });
    expect(response.status()).toBe(200);
    expect(await read()).toBe(want);
  });

  test('records the acting user in the audit trail, from the token', async ({ request }) => {
    await request.patch('/api/iam/users/u-3/active', { headers: ADMIN, data: { active: false } });

    const body = (await (await request.get('/api/audit', { headers: ADMIN })).json()) as {
      entries: { actor: string; action: string; target: string }[];
    };
    const entry = body.entries.find((e) => e.target === 'alan@atlas.dev');
    // the actor is derived from the verified token, never from the request body
    expect(entry?.actor).toBe('u-admin@atlas.dev');
  });

  test('refuses to demote the last admin, which no client could enforce', async ({ request }) => {
    await request.patch('/api/iam/users/u-2/role', { headers: ADMIN, data: { role: 'viewer' } });
    const response = await request.patch('/api/iam/users/u-1/role', {
      headers: ADMIN,
      data: { role: 'viewer' },
    });
    expect(response.status()).toBe(409);
  });
});
