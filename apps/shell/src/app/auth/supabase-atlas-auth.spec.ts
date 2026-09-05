import { TestBed } from '@angular/core/testing';
import { AtlasAuth } from '@atlas/shared-auth';
import { GO_TRUE, GoTrueLike } from './gotrue.port';
import { SupabaseAtlasAuth } from './supabase-atlas-auth';

/**
 * A hand-written stand-in for Supabase's auth client. Everything about the
 * provider is verifiable through it with no Supabase project — which is the
 * whole reason the shell consumes a narrow port rather than the vendor type.
 */
class FakeGoTrue implements GoTrueLike {
  claims: Record<string, unknown> | null = null;
  claimsError: { message: string } | null = null;
  initError: { message: string } | null = null;
  session: { access_token: string } | null = null;
  signInCalls: { provider: string; redirectTo?: string }[] = [];
  signOutCalls: ({ scope?: string } | undefined)[] = [];
  signOutError: { message: string } | null = null;
  signInError: { message: string } | null = null;
  unsubscribed = false;
  private listener?: (event: string, session: { access_token: string } | null) => void;

  async initialize() {
    return { error: this.initError };
  }
  async getClaims() {
    if (this.claimsError || !this.claims) {
      return { data: null, error: this.claimsError } as const;
    }
    return { data: { claims: this.claims }, error: null } as const;
  }
  async getSession() {
    return { data: { session: this.session } };
  }
  onAuthStateChange(cb: (event: string, session: { access_token: string } | null) => void) {
    this.listener = cb;
    return {
      data: { subscription: { unsubscribe: () => void (this.unsubscribed = true) } },
    };
  }
  async signInWithOAuth(c: {
    provider: string;
    options?: { redirectTo?: string };
  }): Promise<{ error: { message: string } | null }> {
    this.signInCalls.push({ provider: c.provider, redirectTo: c.options?.redirectTo });
    return { error: this.signInError };
  }
  async signOut(options?: { scope?: 'global' | 'local' | 'others' }) {
    this.signOutCalls.push(options);
    return { error: this.signOutError };
  }

  /** Drive the provider the way the real client would. */
  emit(event: string, session: { access_token: string } | null) {
    this.listener?.(event, session);
  }
}

function setup(configure: (fake: FakeGoTrue) => void = () => undefined) {
  const fake = new FakeGoTrue();
  configure(fake);
  TestBed.configureTestingModule({
    providers: [{ provide: GO_TRUE, useValue: fake }, { provide: AtlasAuth, useClass: SupabaseAtlasAuth }],
  });
  return { fake, auth: TestBed.inject(AtlasAuth) };
}

const adminClaims = { sub: 'u-1', email: 'ada@atlas.dev', app_metadata: { atlas_role: 'admin' } };

describe('SupabaseAtlasAuth', () => {
  it('starts unauthenticated when there is no session', async () => {
    const { auth } = setup();
    await auth.init();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('restores a session through init(), which is the app-initializer seam', async () => {
    const { auth } = setup((f) => (f.claims = adminClaims));
    await auth.init();
    expect(auth.user()).toMatchObject({ id: 'u-1', email: 'ada@atlas.dev', role: 'admin' });
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('still boots when initialize() reports an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { auth } = setup((f) => (f.initError = { message: 'network down' }));
    await auth.init();
    // degraded, not crashed — the console must still render its chrome
    expect(auth.isAuthenticated()).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('satisfies hasRole from the inherited contract', async () => {
    const { auth } = setup((f) => (f.claims = adminClaims));
    await auth.init();
    expect(auth.hasRole('admin')).toBe(true);
    expect(auth.hasRole('viewer')).toBe(true);
  });

  it('signs out locally rather than globally, and clears even when the call fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { auth, fake } = setup((f) => {
      f.claims = adminClaims;
      f.signOutError = { message: 'offline' };
    });
    await auth.init();
    expect(auth.isAuthenticated()).toBe(true);

    await auth.logout();

    expect(fake.signOutCalls).toEqual([{ scope: 'local' }]);
    // a failed network call must not leave the console looking signed in
    expect(auth.isAuthenticated()).toBe(false);
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('starts an OAuth redirect back to this origin', async () => {
    const { auth, fake } = setup();
    await auth.login('github');
    expect(fake.signInCalls).toEqual([
      { provider: 'github', redirectTo: `${location.origin}/` },
    ]);
  });

  it('surfaces a sign-in failure instead of silently doing nothing', async () => {
    const { auth } = setup((f) => (f.signInError = { message: 'provider not configured' }));
    await expect(auth.login('github')).rejects.toThrow('provider not configured');
  });

  it('hands the BFF a bearer token, or null when signed out', async () => {
    const { auth, fake } = setup((f) => (f.session = { access_token: 'jwt-123' }));
    expect(await auth.getAccessToken()).toBe('jwt-123');
    fake.session = null;
    expect(await auth.getAccessToken()).toBeNull();
  });

  it('drops the user when the client reports a sign-out from another tab', async () => {
    const { auth, fake } = setup((f) => (f.claims = adminClaims));
    await auth.init();
    expect(auth.isAuthenticated()).toBe(true);

    fake.emit('SIGNED_OUT', null);

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('re-verifies claims after a token refresh rather than trusting the event', async () => {
    const { auth, fake } = setup((f) => (f.claims = adminClaims));
    await auth.init();

    // the role was revoked server-side between issuing and refreshing
    fake.claims = { ...adminClaims, app_metadata: { atlas_role: 'viewer' } };
    fake.emit('TOKEN_REFRESHED', { access_token: 'jwt-2' });
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));

    expect(auth.user()?.role).toBe('viewer');
  });
});
