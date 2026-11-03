import { provideHttpClient, withFetch, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injectable, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AtlasAuth, AuthUser, MockAtlasAuth, atlasAuthInterceptor } from '@atlas/shared-auth';
import { firstValueFrom } from 'rxjs';
import { DEMO_USER, DemoAtlasAuth, provideDemoSession } from './demo-session';

const REAL: AuthUser = { id: 'u-1', name: 'Grace', email: 'grace@atlas.dev', role: 'viewer' };

/** A real provider a test can sign in and out of, as a token refresh would. */
@Injectable()
class ScriptedRealAuth extends AtlasAuth {
  static instance: ScriptedRealAuth;
  readonly current = signal<AuthUser | null>(null);
  readonly user = this.current.asReadonly();
  readonly isAuthenticated = computed(() => this.current() !== null);
  readonly logout = vi.fn(async () => this.current.set(null));
  readonly login = vi.fn(async (_hint?: string): Promise<void> => undefined);
  /** A session with no user: TokenAtlasAuth holds one when a token carries no `sub`. */
  orphanToken: string | null = null;

  constructor() {
    super();
    ScriptedRealAuth.instance = this;
  }
  async init(): Promise<void> {
    return undefined;
  }
  async getAccessToken(): Promise<string | null> {
    return this.orphanToken ?? (this.current() ? 'real.signed.token' : null);
  }
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideDemoSession(ScriptedRealAuth)] });
  const auth = TestBed.inject(AtlasAuth) as DemoAtlasAuth;
  return { auth, real: ScriptedRealAuth.instance };
}

describe('the demo session', () => {
  it('holds the role only through toAtlasRole, and is no real user', () => {
    expect(DEMO_USER).toMatchObject({ id: 'demo', name: 'Demo visitor', role: 'admin' });
  });

  it('starts off, whatever is stored, and only enter() starts it', async () => {
    localStorage.setItem('atlas.auth.persona', 'admin');
    sessionStorage.setItem('atlas.demo', '1');
    const { auth } = setup();
    await auth.init();
    expect(auth.active()).toBe(false);
    expect(auth.user()).toBeNull();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores nothing, so a reload cannot resume it', () => {
    localStorage.clear();
    sessionStorage.clear();
    const { auth } = setup();
    auth.enter();
    TestBed.tick();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  describe('is not a login', () => {
    it('opens the role gate, for the mock data behind it', () => {
      const { auth } = setup();
      auth.enter();
      expect(auth.user()).toBe(DEMO_USER);
      expect(auth.hasRole('admin')).toBe(true);
    });

    it('never reports authenticated', () => {
      const { auth } = setup();
      auth.enter();
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('has no token', async () => {
      const { auth } = setup();
      auth.enter();
      await expect(auth.getAccessToken()).resolves.toBeNull();
    });

    it('does not hand over a token the real provider holds with no user behind it', async () => {
      const { auth, real } = setup();
      real.orphanToken = 'real.signed.token';
      auth.enter();
      await expect(auth.getAccessToken()).resolves.toBeNull();

      await auth.logout();
      await expect(auth.getAccessToken()).resolves.toBe('real.signed.token');
    });

    it('sends no credential on a same-origin API call', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideDemoSession(ScriptedRealAuth),
          provideHttpClient(withFetch(), withInterceptors([atlasAuthInterceptor])),
          provideHttpClientTesting(),
        ],
      });
      (TestBed.inject(AtlasAuth) as DemoAtlasAuth).enter();

      const pending = firstValueFrom(TestBed.inject(HttpClient).get('/api/flags'));
      await new Promise((resolve) => setTimeout(resolve));
      const call = TestBed.inject(HttpTestingController).expectOne('/api/flags');
      expect(call.request.headers.has('Authorization')).toBe(false);
      call.flush([]);
      await pending;
    });

    /** The fake persona token exists for the dev Worker; it must not leak in here. */
    it('does not borrow the mock persona token when it wraps the mock', async () => {
      TestBed.configureTestingModule({ providers: [provideDemoSession(MockAtlasAuth)] });
      const auth = TestBed.inject(AtlasAuth) as DemoAtlasAuth;
      auth.enter();
      await expect(auth.getAccessToken()).resolves.toBeNull();
    });
  });

  describe('gives way to a real session', () => {
    it('refuses to start while one exists', () => {
      const { auth, real } = setup();
      real.current.set(REAL);
      expect(auth.enter()).toBe(false);
      expect(auth.active()).toBe(false);
      expect(auth.user()).toBe(REAL);
    });

    it('a real user replaces it at once, with the real role and token', async () => {
      const { auth, real } = setup();
      auth.enter();
      real.current.set(REAL);
      expect(auth.active()).toBe(false);
      expect(auth.user()).toBe(REAL);
      expect(auth.hasRole('admin')).toBe(false);
      expect(auth.isAuthenticated()).toBe(true);
      await expect(auth.getAccessToken()).resolves.toBe('real.signed.token');
    });

    it('losing that real session lands on signed out, not back in the demo', () => {
      const { auth, real } = setup();
      auth.enter();
      real.current.set(REAL);
      TestBed.tick();
      real.current.set(null);
      expect(auth.active()).toBe(false);
      expect(auth.user()).toBeNull();
    });

    it('stays while a redirect is only starting, and hands the hint through', async () => {
      const { auth, real } = setup();
      auth.enter();
      await auth.login('github');
      expect(real.login).toHaveBeenCalledWith('github');
      expect(auth.active()).toBe(true);
    });

    it('ends when a login completes synchronously, as the mock personas do', async () => {
      TestBed.configureTestingModule({ providers: [provideDemoSession(MockAtlasAuth)] });
      const auth = TestBed.inject(AtlasAuth) as DemoAtlasAuth;
      auth.enter();
      await auth.login('viewer');
      expect(auth.user()?.role).toBe('viewer');
      await auth.logout();
      expect(auth.user()).toBeNull();
      localStorage.clear();
    });
  });

  describe('signing out', () => {
    it('of the demo returns to plain signed out, and leaves the real provider alone', async () => {
      const { auth, real } = setup();
      auth.enter();
      await auth.logout();
      expect(auth.active()).toBe(false);
      expect(auth.user()).toBeNull();
      expect(real.logout).not.toHaveBeenCalled();
    });

    it('of a real session reaches the real provider', async () => {
      const { auth, real } = setup();
      real.current.set(REAL);
      await auth.logout();
      expect(real.logout).toHaveBeenCalledTimes(1);
    });
  });
});
