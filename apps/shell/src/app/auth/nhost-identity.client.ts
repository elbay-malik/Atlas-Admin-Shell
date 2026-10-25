import { AtlasIdentityClient } from './identity.port';

export interface NhostIdentityConfig {
  /** Auth base URL, including the version segment: https://<sub>.auth.<region>.nhost.run/v1 */
  url: string;
  /** Where the refresh token is persisted. */
  storageKey?: string;
}

/** The query parameter the provider appends when it returns from a redirect. */
const REDIRECT_PARAM = 'refreshToken';
const DEFAULT_STORAGE_KEY = 'atlas.auth';
/** Refresh this far before expiry, so a request never races the clock. */
const REFRESH_SKEW_MS = 60_000;
/** Never schedule a timer tighter than this, even for a very short-lived token. */
const MIN_REFRESH_DELAY_MS = 5_000;
// The '[atlas-auth]' log prefix and the '/signin/provider/' path are this
// client's fingerprint: bundles:check greps every remote for them (ADR-0006).
// Reserved — no other code may log under that prefix, or every remote that
// ships it fails as if it bundled this client.

interface Session {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  claims: Record<string, unknown>;
}

/**
 * A direct client for the provider's auth REST API — no vendor SDK.
 *
 * The provider's own JavaScript SDK would also work, and the conventional
 * choice would be to use it. This does not, for one reason that outweighed the
 * convention: every endpoint below was exercised by hand against the real
 * project before a line of this was written, so the surface is documented by
 * observation rather than by a changing SDK's docs. The secondary benefit is
 * that the shell gains no dependency at all, which matters because ADR-0006
 * forbids the identity client from reaching a remote and `bundles:check`
 * enforces it — a dependency that does not exist cannot leak.
 *
 * What an SDK would have given us, and what is therefore implemented here
 * deliberately: refresh scheduling, token rotation, and redirect pickup.
 */
export class NhostIdentityClient implements AtlasIdentityClient {
  private readonly base: string;
  private readonly storageKey: string;
  private readonly listeners = new Set<() => void>();
  private session: Session | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** In flight refresh, so concurrent callers await one request, not several. */
  private pending: Promise<void> | null = null;

  constructor(config: NhostIdentityConfig) {
    this.base = config.url.replace(/\/$/, '');
    this.storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  }

  async initialize(): Promise<void> {
    const fromRedirect = this.takeRedirectToken();
    const stored = this.readStored();
    const token = fromRedirect ?? stored;
    if (!token) return;

    try {
      await this.exchange(token);
    } catch (error) {
      // A refresh token that no longer works is the normal end of a session,
      // not a failure to report. Clearing is what makes the next load a clean
      // signed-out state rather than a retry loop against a dead token.
      this.clear();
      if (fromRedirect) {
        console.error('[atlas-auth] sign-in could not be completed', error);
      }
    }
  }

  claims(): Record<string, unknown> | null {
    return this.session?.claims ?? null;
  }

  async accessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (Date.now() >= this.session.expiresAt - REFRESH_SKEW_MS) {
      await this.refreshNow();
    }
    return this.session?.accessToken ?? null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signIn(provider: string): Promise<void> {
    const target = new URL(`${this.base}/signin/provider/${encodeURIComponent(provider)}`);
    // The provider refuses a redirectTo that is not allow-listed, which is what
    // stops this being an open redirect. Sending our own origin keeps the
    // allow-list short.
    target.searchParams.set('redirectTo', `${location.origin}/`);
    location.assign(target.toString());
  }

  async signOut(): Promise<void> {
    const refreshToken = this.readStored();
    // Cleared FIRST and unconditionally: a failed network call must never leave
    // the console appearing signed in.
    this.clear();
    if (!refreshToken) return;
    try {
      await fetch(`${this.base}/signout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      console.warn('[atlas-auth] sign-out could not be recorded by the provider', error);
    }
  }

  /**
   * Reads the redirect token out of the URL and REMOVES it immediately.
   *
   * Stripping it is not tidiness. Left in place it sits in the address bar
   * where it is copied and pasted, in browser history, and in the Referer of
   * every subsequent request from this page. The token is single-use, but a
   * single use is all it takes to mint a session.
   *
   * Removed before the exchange rather than after, so a failed exchange does
   * not leave it behind either.
   */
  private takeRedirectToken(): string | null {
    const url = new URL(location.href);
    const token =
      url.searchParams.get(REDIRECT_PARAM) ??
      new URLSearchParams(url.hash.replace(/^#/, '')).get(REDIRECT_PARAM);
    if (!token) return null;

    url.searchParams.delete(REDIRECT_PARAM);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    hash.delete(REDIRECT_PARAM);
    url.hash = hash.toString() ? `#${hash}` : '';
    history.replaceState(null, '', url.toString());
    return token;
  }

  /** Exchanges a refresh token for a session, rotating the stored token. */
  private async exchange(refreshToken: string): Promise<void> {
    const response = await fetch(`${this.base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      throw new Error(`token exchange failed: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    // Observed shape from the live endpoint:
    //   { accessToken, accessTokenExpiresIn, refreshToken, refreshTokenId, user }
    // i.e. flat, not nested. The sign-in endpoints DO nest theirs under
    // `session`, so this accepts either — the two differ and only one of them
    // is exercised here.
    const session = (body['session'] as Record<string, unknown>) ?? body;

    const accessToken = session['accessToken'];
    const next = session['refreshToken'];
    if (typeof accessToken !== 'string' || typeof next !== 'string') {
      throw new Error('token exchange returned no session');
    }

    const claims = decodeClaims(accessToken);
    // Prefer the token's own exp over the response's lifetime field: it is what
    // the edge will actually enforce, so the two can never drift.
    const exp = typeof claims['exp'] === 'number' ? claims['exp'] * 1000 : Date.now() + 60_000;

    // ROTATION, and it is not speculative: the live endpoint returns a NEW
    // refreshToken on every exchange and invalidates the one just spent.
    // Failing to store the replacement turns the next page load into a forced
    // sign-in — a failure that surfaces a whole session after its cause.
    this.writeStored(next);
    this.session = { accessToken, expiresAt: exp, claims };
    this.scheduleRefresh();
    this.notify();
  }

  private async refreshNow(): Promise<void> {
    // Several callers may hit an expiring token at once; one request serves
    // them all, and a second would spend a refresh token the first just rotated.
    this.pending ??= (async () => {
      const refreshToken = this.readStored();
      if (!refreshToken) {
        this.clear();
        return;
      }
      try {
        await this.exchange(refreshToken);
      } catch (error) {
        console.warn('[atlas-auth] session could not be refreshed', error);
        this.clear();
      }
    })().finally(() => (this.pending = null));

    await this.pending;
  }

  private scheduleRefresh(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (!this.session) return;
    const delay = Math.max(this.session.expiresAt - Date.now() - REFRESH_SKEW_MS, MIN_REFRESH_DELAY_MS);
    this.timer = setTimeout(() => void this.refreshNow(), delay);
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.session = null;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // storage unavailable (private mode); the in-memory session is already gone
    }
    this.notify();
  }

  private readStored(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private writeStored(token: string): void {
    try {
      localStorage.setItem(this.storageKey, token);
    } catch {
      // Storage refused: the session still works for this tab, it just will not
      // survive a reload. Degrading beats refusing to sign in.
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Reads a JWT payload WITHOUT verifying it.
 *
 * That is correct here and would be wrong anywhere else: the browser cannot
 * hold a verification key, and the edge BFF is the authorization boundary
 * (ADR-0011). These claims decide what the console displays and which nav items
 * it offers — never what the platform permits.
 */
function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) return {};
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
