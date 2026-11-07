import { AtlasIdentityClient, IdentityIssue } from './identity.port';

export interface NhostIdentityConfig {
  /** Auth base URL, including the version segment: https://<sub>.auth.<region>.nhost.run/v1 */
  url: string;
  /** Where the refresh token is persisted. */
  storageKey?: string;
}

/** The query parameter the provider appends when it returns from a redirect. */
const REDIRECT_PARAM = 'refreshToken';
/** How the provider reports a failed sign-in on the same redirect. */
const ERROR_CODE_PARAM = 'error';
const ERROR_DETAIL_PARAMS = ['errorDescription', 'error_description'];
const DEFAULT_STORAGE_KEY = 'atlas.auth';
/**
 * Set by signIn() just before the tab leaves for the provider, and read once by
 * the next initialize(). A redirect token is accepted only while it is present,
 * so a token arrives only on the return from a sign-in this tab started.
 * sessionStorage, because it belongs to this tab and survives the round trip.
 */
export const SIGN_IN_MARKER_KEY = 'atlas.auth.signin';
/** A sign-in that took longer than this to come back is treated as not started. */
export const SIGN_IN_MARKER_TTL_MS = 10 * 60_000;
/** Refresh this far before expiry, so a request never races the clock. */
const REFRESH_SKEW_MS = 60_000;
/** Never schedule a timer tighter than this, even for a very short-lived token. */
const MIN_REFRESH_DELAY_MS = 5_000;
/**
 * How long one token exchange may take.
 *
 * The app initializer awaits the exchange at boot, so with no limit a sleeping
 * provider means a console that never renders. Short enough that someone is
 * still watching, long enough for a slow but working provider.
 */
export const TOKEN_EXCHANGE_TIMEOUT_MS = 8_000;
// The '[atlas-auth]' log prefix and the '/signin/provider/' path are this
// client's fingerprint: bundles:check greps every remote for them (ADR-0006).
// Reserved — no other code may log under that prefix, or every remote that
// ships it fails as if it bundled this client.

/**
 * The exchange got no verdict: timeout, network failure or a provider 5xx.
 * Nothing says the token is bad, unlike a 4xx, so it must not be thrown away.
 */
class ProviderUnreachable extends Error {}

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
  private issue: IdentityIssue | null = null;
  private watchingReturn = false;

  constructor(config: NhostIdentityConfig) {
    this.base = config.url.replace(/\/$/, '');
    this.storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  }

  async initialize(): Promise<void> {
    this.issue = this.readProviderError();
    // Both read on every boot: the marker is spent and the URL token leaves the
    // address bar whether or not either one is used.
    const started = this.takeSignInMarker();
    const inUrl = this.takeRedirectToken();
    if (inUrl && !started) {
      // Not a return from this tab's own sign-in, so it is not used at all and
      // the stored session carries on as if the URL had held nothing.
      console.warn('[atlas-auth] ignored a sign-in token this tab did not ask for');
    }
    const fromRedirect = started ? inUrl : null;
    const stored = this.readStored();

    if (fromRedirect) {
      const outcome = await this.completeSignIn(fromRedirect, stored);
      if (outcome !== 'rejected' || !stored) return;
      // The new sign-in failed, but the session already here is untouched by
      // that and still gets its chance. The sign-in notice stays the one shown.
      const reported = this.issue;
      await this.restore(stored);
      this.issue = reported;
      return;
    }
    if (stored) await this.restore(stored);
  }

  /**
   * Exchanges the token the provider just sent back.
   *
   * The stored token is never overwritten or removed on account of the redirect
   * until an exchange has succeeded: exchange() writes the rotated token only on
   * success. The one write without a success is the provider-unreachable case
   * with nothing stored, where keeping the redirect token is the only way a
   * reload can finish this sign-in. With a token already stored, that token is
   * kept as it is and the sign-in is simply not finished.
   */
  private async completeSignIn(
    token: string,
    stored: string | null
  ): Promise<'signed-in' | 'unreachable' | 'rejected'> {
    try {
      await this.exchange(token);
      return 'signed-in';
    } catch (error) {
      if (error instanceof ProviderUnreachable) {
        if (!stored) this.writeStored(token);
        this.issue = { kind: 'provider-unreachable', during: 'sign-in' };
        console.warn('[atlas-auth] the identity provider did not answer', error);
        return 'unreachable';
      }
      this.issue = { kind: 'sign-in-rejected' };
      console.error('[atlas-auth] sign-in could not be completed', error);
      return 'rejected';
    }
  }

  /** Restores the session from the stored token. */
  private async restore(stored: string): Promise<void> {
    try {
      await this.exchange(stored);
    } catch (error) {
      if (error instanceof ProviderUnreachable) {
        // Keep the token: this is the provider being asleep, and clearing it
        // would turn a slow minute into a forced sign-in.
        this.issue = { kind: 'provider-unreachable', during: 'restore' };
        console.warn('[atlas-auth] the identity provider did not answer', error);
        return;
      }
      // A refresh token that no longer works is the normal end of a session.
      // Clearing is what makes the next load a clean signed-out state rather
      // than a retry loop against a dead token.
      this.clear();
      this.issue = { kind: 'session-expired' };
    }
  }

  takeIssue(): IdentityIssue | null {
    const issue = this.issue;
    this.issue = null;
    return issue;
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
    // allow-list short, which is also why the intended route does not travel
    // here: the shell keeps it in sessionStorage (see intended-route.ts).
    target.searchParams.set('redirectTo', `${location.origin}/`);
    try {
      sessionStorage.setItem(SIGN_IN_MARKER_KEY, String(Date.now()));
    } catch {
      // Storage refused: the return from the provider will be ignored, which
      // costs this sign-in and nothing else.
    }
    this.forgetMarkerOnBackNavigation();
    location.assign(target.toString());
  }

  async signOut(): Promise<void> {
    const refreshToken = this.readStored();
    // Cleared FIRST and unconditionally: a failed network call must never leave
    // the console appearing signed in.
    this.clear();
    if (!refreshToken) return;
    try {
      const response = await fetch(`${this.base}/signout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        console.warn(
          `[atlas-auth] sign-out could not be recorded by the provider: ${response.status}`
        );
      }
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
    const token = this.readParam(REDIRECT_PARAM);
    if (token === null) return null;
    this.stripParams([REDIRECT_PARAM]);
    return token || null;
  }

  /**
   * Back from the provider's page via the browser's cache means this sign-in
   * did not come back through the redirect, and a cached page does not run
   * initialize() again. So the marker goes here, rather than waiting out its
   * TTL. A stalled sign-in keeps it: a provider that is slow to open may still
   * return to this tab with a token.
   */
  private forgetMarkerOnBackNavigation(): void {
    if (this.watchingReturn) return;
    this.watchingReturn = true;
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      try {
        sessionStorage.removeItem(SIGN_IN_MARKER_KEY);
      } catch {
        // Nothing to remove if storage is refused.
      }
    });
  }

  /**
   * Reads and removes the marker signIn() left. True only when it is there and
   * younger than SIGN_IN_MARKER_TTL_MS; removed in every case, so one sign-in
   * accepts at most one redirect.
   */
  private takeSignInMarker(): boolean {
    try {
      const value = sessionStorage.getItem(SIGN_IN_MARKER_KEY);
      sessionStorage.removeItem(SIGN_IN_MARKER_KEY);
      if (value === null) return false;
      const age = Date.now() - Number(value);
      return Number.isFinite(age) && age >= 0 && age <= SIGN_IN_MARKER_TTL_MS;
    } catch {
      return false;
    }
  }

  /**
   * Reads a failed sign-in off the redirect and removes it from the URL.
   *
   * The URL can be written by anyone who makes a link, so nothing from it
   * reaches the screen: the notice is always the same generic sentence, and
   * the provider's code and description go to the console only.
   */
  private readProviderError(): IdentityIssue | null {
    const code = this.readParam(ERROR_CODE_PARAM);
    const detail = ERROR_DETAIL_PARAMS.map((name) => this.readParam(name)).find(Boolean);
    if (code === null && !detail) return null;

    this.stripParams([ERROR_CODE_PARAM, ...ERROR_DETAIL_PARAMS]);
    console.error('[atlas-auth] the provider refused the sign-in', code, detail);
    return { kind: 'sign-in-rejected' };
  }

  private readParam(name: string): string | null {
    const url = new URL(location.href);
    return (
      url.searchParams.get(name) ?? new URLSearchParams(url.hash.replace(/^#/, '')).get(name)
    );
  }

  /** Removes the named parameters and leaves the rest of the URL exactly as it was. */
  private stripParams(names: string[]): void {
    const url = new URL(location.href);
    for (const name of names) url.searchParams.delete(name);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (names.some((name) => hash.has(name))) {
      for (const name of names) hash.delete(name);
      url.hash = hash.toString() ? `#${hash}` : '';
    }
    history.replaceState(null, '', url.toString());
  }

  /** Exchanges a refresh token for a session, rotating the stored token. */
  private async exchange(refreshToken: string): Promise<void> {
    const body = await this.postToken(refreshToken);
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

  /** One bounded POST, body read included: a stalled body hangs boot just the same. */
  private async postToken(refreshToken: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.base}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });
      if (response.status >= 500) {
        throw new ProviderUnreachable(`token exchange answered ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`token exchange failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderUnreachable(`no answer in ${TOKEN_EXCHANGE_TIMEOUT_MS}ms`);
      }
      // fetch rejects with a TypeError only when no response arrived at all.
      if (error instanceof TypeError) throw new ProviderUnreachable(error.message);
      throw error;
    } finally {
      clearTimeout(timer);
    }
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
