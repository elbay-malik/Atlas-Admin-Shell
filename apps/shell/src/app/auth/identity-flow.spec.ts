import { Component, computed, Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AtlasAuth, AuthUser } from '@atlas/shared-auth';
import { AtlasManifest } from '@atlas/shared-contracts';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { buildRoutes } from '../../bootstrap';
import { ATLAS_MANIFEST } from '../manifest.token';
import { ShellNotice } from '../notice/shell-notice';
import { RemoteLoader } from '../remotes/remote-loader';
import { DEMO_USER, DemoAtlasAuth, provideDemoSession } from './demo-session';
import { IdentityFlow, providerName, SIGN_IN_STALL_MS } from './identity-flow';
import { ATLAS_IDENTITY, AtlasIdentityClient, IdentityIssue } from './identity.port';

@Component({ selector: 'shell-remote-home', template: 'remote' })
class RemoteHome {}

const manifest: AtlasManifest = {
  version: 1,
  auth: { kind: 'nhost', url: 'https://p.auth.example/v1', provider: 'github' },
  remotes: {
    iam: {
      url: 'http://localhost:4201/remoteEntry.json',
      displayName: 'Identity & Access',
      route: 'iam',
      icon: 'users',
      exposedModule: './Routes',
      requiredRole: 'admin',
    },
    'feature-flags': {
      url: 'http://localhost:4202/remoteEntry.json',
      displayName: 'Feature Flags',
      route: 'flags',
      icon: 'flag',
      exposedModule: './Routes',
      requiredRole: 'viewer',
    },
  },
};

const ADMIN: AuthUser = { id: 'u-1', name: 'Ada', email: 'ada@atlas.dev', role: 'admin' };
const VIEWER: AuthUser = { ...ADMIN, role: 'viewer' };

/** An auth whose user a test can change, the way a token refresh changes it. */
@Injectable()
class ScriptedAuth extends AtlasAuth {
  readonly current = signal<AuthUser | null>(null);
  readonly user = this.current.asReadonly();
  readonly isAuthenticated = computed(() => this.current() !== null);
  login = vi.fn(async (): Promise<void> => undefined);
  async init(): Promise<void> {
    return undefined;
  }
  async logout(): Promise<void> {
    this.current.set(null);
  }
  async getAccessToken(): Promise<string | null> {
    return null;
  }
}

function setup(options: { user?: AuthUser | null; issue?: IdentityIssue } = {}) {
  const identity = { takeIssue: () => options.issue ?? null } as unknown as AtlasIdentityClient;
  TestBed.configureTestingModule({
    providers: [
      provideAtlasEventBus(),
      provideRouter(buildRoutes(manifest)),
      { provide: ATLAS_MANIFEST, useValue: manifest },
      { provide: AtlasAuth, useClass: ScriptedAuth },
      { provide: ATLAS_IDENTITY, useValue: identity },
      { provide: RemoteLoader, useValue: { load: async () => [{ path: '', component: RemoteHome }] } },
    ],
  });
  const auth = TestBed.inject(AtlasAuth) as ScriptedAuth;
  auth.current.set(options.user ?? null);
  return {
    auth,
    router: TestBed.inject(Router),
    notice: TestBed.inject(ShellNotice),
    flow: TestBed.inject(IdentityFlow),
  };
}

/** Lets the effect run and any navigation it started finish. */
async function settle(): Promise<void> {
  TestBed.tick();
  await TestBed.inject(Router).navigated;
  await new Promise((resolve) => setTimeout(resolve));
  await TestBed.inject(Router).navigated;
  await new Promise((resolve) => setTimeout(resolve));
}

/** ScriptedAuth as the real provider behind the demo, reachable from a test. */
@Injectable()
class ScriptedRealAuth extends ScriptedAuth {
  static latest: ScriptedRealAuth;
  constructor() {
    super();
    ScriptedRealAuth.latest = this;
  }
}

/** The flow on a deployment that offers the demo. */
function setupWithDemo() {
  TestBed.configureTestingModule({
    providers: [
      provideAtlasEventBus(),
      provideRouter(buildRoutes(manifest)),
      { provide: ATLAS_MANIFEST, useValue: manifest },
      provideDemoSession(ScriptedRealAuth),
      { provide: ATLAS_IDENTITY, useValue: { takeIssue: () => null } },
      { provide: RemoteLoader, useValue: { load: async () => [{ path: '', component: RemoteHome }] } },
    ],
  });
  const auth = TestBed.inject(AtlasAuth) as DemoAtlasAuth;
  return {
    auth,
    real: ScriptedRealAuth.latest,
    router: TestBed.inject(Router),
    notice: TestBed.inject(ShellNotice),
    flow: TestBed.inject(IdentityFlow),
  };
}

describe('IdentityFlow', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.useRealTimers());

  describe('on a deployment that offers the demo', () => {
    it('names the demo when a route declines a signed-out visitor', async () => {
      const { router, notice } = setupWithDemo();
      await router.navigateByUrl('/flags');
      expect(notice.current()?.text).toBe(
        'Sign in or explore with demo data to open Feature Flags.'
      );
    });

    it('reaches a role-gated route once the visitor chooses the demo', async () => {
      const { router, flow } = setupWithDemo();
      flow.enterDemo();
      await settle();
      await router.navigateByUrl('/iam');
      expect(router.url).toBe('/iam');
    });

    it('goes on to the route that sent them away', async () => {
      const { router, flow } = setupWithDemo();
      await router.navigateByUrl('/iam');
      expect(router.url).toBe('/');
      flow.enterDemo();
      await settle();
      expect(router.url).toBe('/iam');
    });

    it('leaving the demo returns to plain signed out, and says which it was', async () => {
      const { auth, router, notice, flow } = setupWithDemo();
      flow.enterDemo();
      await settle();
      await router.navigateByUrl('/iam');

      await flow.signOut();
      await settle();

      expect(router.url).toBe('/');
      expect(auth.user()).toBeNull();
      expect(notice.current()).toEqual({ text: 'Demo ended.', tone: 'info' });
    });

    it('a real sign-in ends the demo and is judged on its own role', async () => {
      const { auth, real, router, notice, flow } = setupWithDemo();
      flow.enterDemo();
      await settle();
      await router.navigateByUrl('/iam');

      real.current.set(VIEWER);
      await settle();

      expect(auth.active()).toBe(false);
      expect(auth.user()).toEqual(VIEWER);
      expect(router.url).toBe('/');
      expect(notice.current()?.text).toContain('you are a viewer');
    });

    it('stays busy while a provider redirect starts from inside the demo', async () => {
      const { auth, flow } = setupWithDemo();
      flow.enterDemo();
      await settle();
      expect(auth.user()).toBe(DEMO_USER);

      await flow.signIn('github');

      expect(flow.signingIn()).toBe(true);
    });

    it('stops being busy when the real user arrives during that sign-in', async () => {
      const { real, flow } = setupWithDemo();
      flow.enterDemo();
      await settle();
      await flow.signIn('github');

      real.current.set(VIEWER);
      await settle();

      expect(flow.signingIn()).toBe(false);
    });

    it('stays in the labelled demo and reports it when a sign-in cannot start', async () => {
      const { auth, real, notice, flow } = setupWithDemo();
      flow.enterDemo();
      await settle();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(real, 'login').mockRejectedValueOnce(new Error('no provider'));

      await flow.signIn('github');
      spy.mockRestore();

      expect(auth.active()).toBe(true);
      expect(flow.signingIn()).toBe(false);
      expect(notice.current()).toEqual({
        text: 'Sign-in could not be started. Try again.',
        tone: 'problem',
      });
    });
  });

  describe('when a session ends on a protected route', () => {
    it('leaves the route and says it was a sign-out', async () => {
      const { router, notice, flow } = setup({ user: ADMIN });
      await router.navigateByUrl('/iam');
      expect(router.url).toBe('/iam');

      await flow.signOut();
      await settle();

      expect(router.url).toBe('/');
      expect(notice.current()).toEqual({ text: 'Signed out.', tone: 'info' });
    });

    it('says the session ended when nobody asked for it', async () => {
      const { auth, router, notice } = setup({ user: ADMIN });
      await router.navigateByUrl('/flags');

      auth.current.set(null); // what a failed refresh does
      await settle();

      expect(router.url).toBe('/');
      expect(notice.current()).toEqual({ text: 'Your session ended.', tone: 'info' });
    });

    it('stays put on a route that needs no session', async () => {
      const { auth, router, notice } = setup({ user: ADMIN });
      await router.navigateByUrl('/definitely-not-a-remote');

      auth.current.set(null);
      await settle();

      expect(router.url).toBe('/definitely-not-a-remote');
      expect(notice.current()?.text).toBe('Your session ended.');
    });

    it('returns to the route after a lost session, but not after a sign-out', async () => {
      const lost = setup({ user: ADMIN });
      await lost.router.navigateByUrl('/flags');
      lost.auth.current.set(null);
      await settle();
      expect(sessionStorage.getItem('atlas.auth.intended')).toBe('/flags');

      TestBed.resetTestingModule();
      sessionStorage.clear();

      const out = setup({ user: ADMIN });
      await out.router.navigateByUrl('/flags');
      await out.flow.signOut();
      await settle();
      expect(sessionStorage.getItem('atlas.auth.intended')).toBeNull();
    });
  });

  describe('when a route declines the visitor', () => {
    it('tells a viewer which role they lack', async () => {
      const { router, notice } = setup({ user: VIEWER });

      await router.navigateByUrl('/iam');

      expect(router.url).toBe('/');
      expect(notice.current()?.text).toBe(
        'Identity & Access requires the admin role; you are a viewer.'
      );
    });

    it('sends a sub-route to the overview too, rather than to a not-found', async () => {
      const { router } = setup({ user: VIEWER });

      await router.navigateByUrl('/iam/users/1');

      expect(router.url).toBe('/');
    });

    it('re-checks when a refresh takes a role away', async () => {
      const { auth, router, notice } = setup({ user: ADMIN });
      await router.navigateByUrl('/iam');
      await settle();

      auth.current.set(VIEWER);
      await settle();

      expect(router.url).toBe('/');
      expect(notice.current()?.text).toContain('requires the admin role');
    });

    it('does not navigate when a refresh changes nothing that matters', async () => {
      const { auth, router } = setup({ user: ADMIN });
      await router.navigateByUrl('/iam');
      await settle();
      const navigate = vi.spyOn(router, 'navigateByUrl');

      auth.current.set({ ...ADMIN }); // a new object, as every token refresh makes
      await settle();

      expect(navigate).not.toHaveBeenCalled();
    });

    it('asks a signed-out visitor to sign in and remembers where they were going', async () => {
      const { router, notice } = setup();

      await router.navigateByUrl('/iam?tab=roles');

      expect(router.url).toBe('/');
      expect(notice.current()?.text).toBe('Sign in to open Identity & Access.');
      expect(sessionStorage.getItem('atlas.auth.intended')).toBe('/iam?tab=roles');
    });
  });

  describe('signing in', () => {
    it('goes to the remembered route', async () => {
      const { auth, router } = setup();
      await router.navigateByUrl('/iam');
      expect(router.url).toBe('/');

      auth.current.set(ADMIN);
      await settle();

      expect(router.url).toBe('/iam');
      expect(sessionStorage.getItem('atlas.auth.intended')).toBeNull();
    });

    it('still gates the remembered route, and says so', async () => {
      const { auth, router, notice } = setup();
      await router.navigateByUrl('/iam');

      auth.current.set(VIEWER);
      await settle();

      expect(router.url).toBe('/');
      expect(notice.current()?.text).toContain('requires the admin role; you are a viewer');
    });

    it('never follows an off-site value planted in storage', async () => {
      const { auth, router } = setup();
      await router.navigateByUrl('/');
      sessionStorage.setItem('atlas.auth.intended', '//evil.example');

      auth.current.set(ADMIN);
      await settle();

      expect(router.url).toBe('/');
    });

    it('clears an old notice', async () => {
      const { auth, router, notice } = setup();
      await router.navigateByUrl('/iam');
      expect(notice.current()).not.toBeNull();

      auth.current.set(ADMIN);
      await settle();

      expect(notice.current()).toBeNull();
    });

    it('stays busy while the provider redirect runs, and ignores a second press', async () => {
      const { auth, flow } = setup();

      await flow.signIn('github');
      expect(flow.signingIn()).toBe(true);

      await flow.signIn('github');
      expect(auth.login).toHaveBeenCalledTimes(1);
    });

    it('gives the button back with an explanation if the redirect stalls', async () => {
      vi.useFakeTimers();
      const { flow, notice } = setup();

      await flow.signIn('github');
      await vi.advanceTimersByTimeAsync(SIGN_IN_STALL_MS);

      expect(flow.signingIn()).toBe(false);
      expect(notice.current()?.text).toContain('GitHub did not open');
      expect(notice.current()?.tone).toBe('problem');
    });

    it('gives the button back with an explanation if the redirect cannot start', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { auth, flow, notice } = setup();
      auth.login.mockRejectedValueOnce(new Error('nope'));

      await flow.signIn('github');

      expect(flow.signingIn()).toBe(false);
      expect(notice.current()?.tone).toBe('problem');
      vi.restoreAllMocks();
    });
  });

  describe('what the identity client reports from boot', () => {
    it.each<[string, IdentityIssue, RegExp, string]>([
      [
        'a coded rejection',
        { kind: 'sign-in-rejected', code: 'access_denied' },
        /Sign-in with GitHub failed: access_denied\. Try again\./,
        'problem',
      ],
      [
        'an uncoded rejection',
        { kind: 'sign-in-rejected', code: null },
        /Sign-in with GitHub could not be completed/,
        'problem',
      ],
      [
        'a timeout during sign-in',
        { kind: 'provider-unreachable', during: 'sign-in' },
        /did not answer, so sign-in has not finished/,
        'problem',
      ],
      [
        'a timeout restoring a session',
        { kind: 'provider-unreachable', during: 'restore' },
        /did not answer, so your session could not be restored/,
        'problem',
      ],
      ['an expired session', { kind: 'session-expired' }, /^Your session ended\.$/, 'info'],
    ])('reports %s', (_name, issue, text, tone) => {
      const { notice } = setup({ issue });

      expect(notice.current()?.text).toMatch(text);
      expect(notice.current()?.tone).toBe(tone);
    });

    it('keeps a boot failure over the generic prompt on a deep link', async () => {
      const { router, notice } = setup({ issue: { kind: 'provider-unreachable', during: 'restore' } });

      await router.navigateByUrl('/iam');

      expect(notice.current()?.text).toContain('did not answer');
    });
  });

  it('retires a notice when the visitor navigates on', async () => {
    const { router, notice } = setup({ user: VIEWER });
    await router.navigateByUrl('/iam');
    expect(notice.current()).not.toBeNull();

    await router.navigateByUrl('/flags');

    expect(notice.current()).toBeNull();
  });
});

describe('providerName', () => {
  it('knows the name is GitHub, not Github', () => {
    expect(providerName('github')).toBe('GitHub');
  });

  it('capitalises one it does not know', () => {
    expect(providerName('gitlab')).toBe('Gitlab');
  });

  it('is empty with no provider', () => {
    expect(providerName(null)).toBe('');
  });
});
