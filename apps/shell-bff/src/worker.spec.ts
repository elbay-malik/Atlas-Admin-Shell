import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Principal } from './authz';
import { type Env, __resetStore, handleApi } from './worker';

/**
 * Two levels here, deliberately.
 *
 * SELF.fetch drives the REAL Worker through workerd, so it proves the wrangler
 * config itself: run_worker_first routing, the ASSETS binding, and that an
 * unknown /api path does not fall through to the SPA fallback.
 *
 * handleApi with an injected verifier proves the authorization rules and the
 * server-side invariants without needing a live JWKS.
 */
const admin: Principal = { sub: 'u-1', email: 'ada@atlas.dev', role: 'admin' };
const viewer: Principal = { sub: 'u-3', email: 'alan@atlas.dev', role: 'viewer' };

const as = (principal: Principal) => async () =>
  ({ ok: true as const, principal });
const anonymous = async () => ({ ok: false as const, status: 401 as const, reason: 'no token' });

function call(method: string, path: string, principal: Principal | null, body?: unknown) {
  const request = new Request(`https://atlas.test${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return handleApi(request, env as unknown as Env, principal ? as(principal) : anonymous);
}

beforeEach(() => __resetStore());

describe('the Worker in front of the assets', () => {
  it('serves a static asset for a non-API path without touching the API', async () => {
    const response = await SELF.fetch('https://atlas.test/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('asset fixture');
  });

  it('falls back to index.html for a deep link, so client routing still works', async () => {
    const response = await SELF.fetch('https://atlas.test/unavailable/audit-logs');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('asset fixture');
  });

  /**
   * The trap this design exists to avoid: env.ASSETS.fetch applies
   * not_found_handling, so delegating an unknown /api path would answer with
   * index.html and a 200, and the client would fail on a confusing parse error.
   */
  it('answers an unknown /api path with JSON 404, never the SPA fallback', async () => {
    const response = await SELF.fetch('https://atlas.test/api/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ status: 404 });
  });

  it('rejects an unauthenticated API call with 401', async () => {
    const response = await SELF.fetch('https://atlas.test/api/flags');
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('never caches an API response', async () => {
    const response = await SELF.fetch('https://atlas.test/api/flags');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('authorization', () => {
  it('refuses an anonymous caller before looking at the route', async () => {
    expect((await call('GET', '/api/flags', null)).status).toBe(401);
  });

  it('lets a viewer read flags and the audit trail', async () => {
    expect((await call('GET', '/api/flags', viewer)).status).toBe(200);
    expect((await call('GET', '/api/audit', viewer)).status).toBe(200);
  });

  it('refuses a viewer the IAM directory with 403, not 401', async () => {
    const response = await call('GET', '/api/iam/users', viewer);
    expect(response.status).toBe(403);
  });

  /**
   * The hole this closes: the flags UI never checks the role, so a viewer can
   * click the toggle today. The server refuses regardless of what the UI allows.
   */
  it('refuses a viewer a flag WRITE even though the UI does not hide it', async () => {
    const response = await call('PATCH', '/api/flags/sso-enforced', viewer, { enabled: true });
    expect(response.status).toBe(403);

    // and the flag really did not move
    const flags = (await (await call('GET', '/api/flags', viewer)).json()) as {
      flags: { key: string; enabled: boolean }[];
    };
    expect(flags.flags.find((f) => f.key === 'sso-enforced')?.enabled).toBe(false);
  });

  it('lets an admin write a flag, and records who did it', async () => {
    expect((await call('PATCH', '/api/flags/sso-enforced', admin, { enabled: true })).status).toBe(200);

    const audit = (await (await call('GET', '/api/audit', admin)).json()) as {
      entries: { actor: string; action: string; target: string }[];
    };
    expect(audit.entries[0]).toMatchObject({
      actor: 'ada@atlas.dev',
      action: 'flag.enabled',
      target: 'sso-enforced',
    });
  });
});

describe('invariants the client cannot enforce', () => {
  it('refuses to demote the last remaining admin', async () => {
    // An operator who is not themselves in the directory, so the self-demotion
    // guard cannot mask the one under test. u-1 and u-2 are the two seeded
    // admins: demote one, and the other becomes undemotable.
    const operator: Principal = { sub: 'u-9', email: 'ops@atlas.dev', role: 'admin' };

    expect((await call('PATCH', '/api/iam/users/u-2/role', operator, { role: 'viewer' })).status)
      .toBe(200);

    const response = await call('PATCH', '/api/iam/users/u-1/role', operator, { role: 'viewer' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ title: expect.stringContaining('last admin') });
  });

  it('refuses to deactivate the last remaining admin', async () => {
    const operator: Principal = { sub: 'u-9', email: 'ops@atlas.dev', role: 'admin' };
    await call('PATCH', '/api/iam/users/u-2/role', operator, { role: 'viewer' });

    const response = await call('PATCH', '/api/iam/users/u-1/active', operator, { active: false });
    expect(response.status).toBe(409);
  });

  /**
   * The `&& u.active` half of wouldRemoveLastAdmin, which nothing else reaches.
   *
   * Every other invariant test DEMOTES an admin, which strips `role: 'admin'`
   * and so removes them from the count by role alone. Deactivation is the case
   * where the distinction bites: a deactivated user KEEPS their admin role, so
   * counting by role treats someone who cannot sign in as cover for someone who
   * can. Delete `&& u.active` and both requests below succeed, leaving a
   * platform with zero admins able to sign in — from two individually legal
   * requests.
   */
  it('counts only ACTIVE admins, so a deactivated one cannot stand in for a live one', async () => {
    const operator: Principal = { sub: 'u-9', email: 'ops@atlas.dev', role: 'admin' };

    // u-2 is deactivated but keeps role: 'admin'
    expect(
      (await call('PATCH', '/api/iam/users/u-2/active', operator, { active: false })).status
    ).toBe(200);

    // u-1 is now the only admin who could actually sign in — both routes out must refuse
    const demote = await call('PATCH', '/api/iam/users/u-1/role', operator, { role: 'viewer' });
    expect(demote.status, 'demoting the last ACTIVE admin').toBe(409);

    const deactivate = await call('PATCH', '/api/iam/users/u-1/active', operator, { active: false });
    expect(deactivate.status, 'deactivating the last ACTIVE admin').toBe(409);
  });

  it('leaves at least one admin able to sign in after the refusals', async () => {
    const operator: Principal = { sub: 'u-9', email: 'ops@atlas.dev', role: 'admin' };
    await call('PATCH', '/api/iam/users/u-2/active', operator, { active: false });
    await call('PATCH', '/api/iam/users/u-1/role', operator, { role: 'viewer' });
    await call('PATCH', '/api/iam/users/u-1/active', operator, { active: false });

    const { users } = (await (await call('GET', '/api/iam/users', operator)).json()) as {
      users: { role: string; active: boolean }[];
    };
    // the property that actually matters: somebody can still administer this thing
    expect(users.filter((u) => u.role === 'admin' && u.active).length).toBeGreaterThan(0);
  });

  it('refuses self-demotion outright, even while other admins remain', async () => {
    // u-2 is still an admin here, so only the self-demotion rule can refuse this
    const response = await call('PATCH', '/api/iam/users/u-1/role', admin, { role: 'viewer' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ title: expect.stringContaining('yourself') });
  });

  it('refuses self-deactivation', async () => {
    const response = await call('PATCH', '/api/iam/users/u-1/active', admin, { active: false });
    expect(response.status).toBe(409);
  });

  it('is idempotent, so an optimistic retry cannot double-write the trail', async () => {
    await call('PATCH', '/api/flags/bulk-export', admin, { enabled: true });
    await call('PATCH', '/api/flags/bulk-export', admin, { enabled: true });

    const audit = (await (await call('GET', '/api/audit', admin)).json()) as {
      entries: { target: string }[];
    };
    expect(audit.entries.filter((e) => e.target === 'bulk-export')).toHaveLength(1);
  });

  it('validates the request body rather than trusting it', async () => {
    expect((await call('PATCH', '/api/flags/bulk-export', admin, { enabled: 'yes' })).status).toBe(400);
    expect((await call('PATCH', '/api/iam/users/u-3/role', admin, { role: 'root' })).status).toBe(400);
    expect((await call('PATCH', '/api/iam/users/nobody/role', admin, { role: 'admin' })).status).toBe(404);
  });

  it('filters the audit trail server-side, treating q as untrusted', async () => {
    await call('PATCH', '/api/flags/bulk-export', admin, { enabled: true });
    await call('PATCH', '/api/iam/users/u-3/active', admin, { active: false });

    const filtered = (await (await call('GET', '/api/audit?q=BULK-EXPORT', admin)).json()) as {
      entries: { target: string }[];
    };
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].target).toBe('bulk-export');
  });
});
