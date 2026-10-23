import { NhostIdentityClient } from './nhost-identity.client';

const BASE = 'https://project.auth.eu-central-1.nhost.run/v1';
const STORAGE_KEY = 'atlas.auth';

/** A token whose payload decodes; nothing here verifies a signature. */
function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part({ alg: 'RS256' })}.${part(payload)}.sig`;
}

const SECONDS = 1000;
const futureExp = () => Math.floor((Date.now() + 900 * SECONDS) / 1000);

/** The live endpoint's shape: flat, with a rotated refresh token. */
function sessionBody(over: Record<string, unknown> = {}) {
  return {
    accessToken: jwt({ sub: 'u-1', exp: futureExp(), 'https://hasura.io/jwt/claims': { a: 1 } }),
    accessTokenExpiresIn: 900,
    refreshToken: 'rotated-token',
    refreshTokenId: 'id-1',
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function atUrl(search: string) {
  history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  atUrl('');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status = 401) =>
  ({ ok: false, status, statusText: 'Unauthorized', json: async () => ({}) }) as Response;

const client = () => new NhostIdentityClient({ url: BASE });

describe('NhostIdentityClient — returning from a redirect', () => {
  it('exchanges the refresh token the provider put in the URL', async () => {
    atUrl('?refreshToken=from-redirect');
    fetchMock.mockResolvedValue(ok(sessionBody()));

    const c = client();
    await c.initialize();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/token`, expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refreshToken: 'from-redirect' });
    expect(c.claims()).toMatchObject({ sub: 'u-1' });
  });

  /**
   * The security property this class exists to get right.
   *
   * Left in the URL, a refresh token sits in the address bar where it is copied
   * and pasted, in browser history, and in the Referer of every later request
   * from this page. It is single-use, but a single use mints a session.
   */
  it('removes the token from the URL', async () => {
    atUrl('?refreshToken=from-redirect');
    fetchMock.mockResolvedValue(ok(sessionBody()));

    await client().initialize();

    expect(location.search).not.toContain('refreshToken');
    expect(location.href).not.toContain('from-redirect');
  });

  it('removes it even when the exchange FAILS', async () => {
    // Stripped before the network call, not after — otherwise a provider
    // outage leaves the credential on screen.
    atUrl('?refreshToken=from-redirect');
    fetchMock.mockResolvedValue(fail());

    await client().initialize();

    expect(location.href).not.toContain('from-redirect');
  });

  it('preserves the rest of the query string', async () => {
    atUrl('?refreshToken=from-redirect&route=flags');
    fetchMock.mockResolvedValue(ok(sessionBody()));

    await client().initialize();

    expect(location.search).toContain('route=flags');
    expect(location.search).not.toContain('refreshToken');
  });

  it('also finds it in the fragment, where some providers put it', async () => {
    history.replaceState(null, '', '/#refreshToken=in-hash');
    fetchMock.mockResolvedValue(ok(sessionBody()));

    await client().initialize();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refreshToken: 'in-hash' });
    expect(location.hash).not.toContain('in-hash');
  });
});

describe('NhostIdentityClient — rotation and persistence', () => {
  it('stores the ROTATED token, not the one it just spent', async () => {
    // The provider invalidates a refresh token on use. Storing the spent one
    // would force a sign-in on the next load — a failure that surfaces a whole
    // session after its cause.
    atUrl('?refreshToken=first');
    fetchMock.mockResolvedValue(ok(sessionBody({ refreshToken: 'second' })));

    await client().initialize();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('second');
  });

  it('restores a session from storage when there is no redirect', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');
    fetchMock.mockResolvedValue(ok(sessionBody()));

    const c = client();
    await c.initialize();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refreshToken: 'stored-token' });
    expect(c.claims()).not.toBeNull();
  });

  it('does nothing at all when signed out', async () => {
    const c = client();
    await c.initialize();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(c.claims()).toBeNull();
  });

  it('clears a stored token the provider no longer accepts', async () => {
    // Being signed out is the normal end of a session, not an error to retry.
    localStorage.setItem(STORAGE_KEY, 'expired');
    fetchMock.mockResolvedValue(fail());

    const c = client();
    await c.initialize();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(c.claims()).toBeNull();
  });
});

describe('NhostIdentityClient — access tokens', () => {
  it('returns the current token without a network call while it is fresh', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored');
    fetchMock.mockResolvedValue(ok(sessionBody()));
    const c = client();
    await c.initialize();
    fetchMock.mockClear();

    const token = await c.accessToken();

    expect(token).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes first when the token is near expiry', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored');
    // Inside the 60s skew, so it must not be handed out as-is.
    const nearlyExpired = jwt({ sub: 'u-1', exp: Math.floor((Date.now() + 10 * SECONDS) / 1000) });
    fetchMock.mockResolvedValueOnce(ok(sessionBody({ accessToken: nearlyExpired })));
    const c = client();
    await c.initialize();

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(ok(sessionBody()));
    await c.accessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent refreshes into ONE request', async () => {
    // Two requests would spend a refresh token the other just rotated, and the
    // second would fail — turning a burst of API calls into a sign-out.
    localStorage.setItem(STORAGE_KEY, 'stored');
    const nearlyExpired = jwt({ sub: 'u-1', exp: Math.floor((Date.now() + 10 * SECONDS) / 1000) });
    fetchMock.mockResolvedValueOnce(ok(sessionBody({ accessToken: nearlyExpired })));
    const c = client();
    await c.initialize();

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(ok(sessionBody()));
    await Promise.all([c.accessToken(), c.accessToken(), c.accessToken()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null, not a stale token, when the refresh fails', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored');
    const nearlyExpired = jwt({ sub: 'u-1', exp: Math.floor((Date.now() + 10 * SECONDS) / 1000) });
    fetchMock.mockResolvedValueOnce(ok(sessionBody({ accessToken: nearlyExpired })));
    const c = client();
    await c.initialize();

    fetchMock.mockResolvedValue(fail());
    expect(await c.accessToken()).toBeNull();
  });
});

describe('NhostIdentityClient — sign out', () => {
  it('clears locally even if the provider call fails', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored');
    fetchMock.mockResolvedValueOnce(ok(sessionBody()));
    const c = client();
    await c.initialize();

    fetchMock.mockRejectedValue(new Error('offline'));
    await c.signOut();

    // A failed network call must never leave the console appearing signed in.
    expect(c.claims()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('NhostIdentityClient — change notification', () => {
  it('notifies on sign-in and on sign-out, and stops after unsubscribe', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored');
    fetchMock.mockResolvedValue(ok(sessionBody()));
    const c = client();
    const seen: number[] = [];
    const off = c.onChange(() => seen.push(1));

    await c.initialize();
    expect(seen.length).toBe(1);

    await c.signOut();
    expect(seen.length).toBe(2);

    off();
    await c.initialize();
    expect(seen.length).toBe(2);
  });
});
