import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withNavigationErrorHandler } from '@angular/router';
import { AtlasAuth, MockAtlasAuth } from '@atlas/shared-auth';
import { AtlasManifest } from '@atlas/shared-contracts';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { buildRoutes, remoteUnavailableRedirect } from '../../bootstrap';
import { ATLAS_MANIFEST } from '../manifest.token';
import { RemoteHealthStore } from './remote-health.store';
import { RemoteLoader, RemoteUnavailableError } from './remote-loader';

/** Stands in for whatever a remote exposes; the shell only cares that it activates. */
@Component({ selector: 'shell-remote-home', template: 'remote' })
class RemoteHome {}

const manifest: AtlasManifest = {
  version: 1,
  remotes: {
    iam: {
      url: 'http://localhost:4201/remoteEntry.json',
      displayName: 'Identity & Access',
      route: 'iam',
      icon: '👥',
      exposedModule: './Routes',
      requiredRole: 'admin',
    },
    'feature-flags': {
      url: 'http://localhost:4202/remoteEntry.json',
      displayName: 'Feature Flags',
      route: 'flags',
      icon: '🚩',
      exposedModule: './Routes',
      requiredRole: 'viewer',
    },
  },
};

/** Counts load attempts so we can prove a failed load is re-invoked, not cached. */
function fakeLoader(behaviour: (name: string, attempt: number) => Promise<unknown>) {
  const attempts: Record<string, number> = {};
  return {
    attempts,
    load: (name: string) => {
      attempts[name] = (attempts[name] ?? 0) + 1;
      // The real loader records the failure before it rejects, and the boundary relies on that.
      return behaviour(name, attempts[name]).catch((error: RemoteUnavailableError) => {
        TestBed.inject(RemoteHealthStore).markDown(name, error.reason, error.message);
        throw error;
      });
    },
  };
}

function setup(loader: { load: (name: string) => Promise<unknown> }) {
  TestBed.configureTestingModule({
    providers: [
      provideAtlasEventBus(),
      { provide: ATLAS_MANIFEST, useValue: manifest },
      { provide: AtlasAuth, useClass: MockAtlasAuth },
      { provide: RemoteLoader, useValue: loader },
      provideRouter(buildRoutes(manifest), withNavigationErrorHandler(remoteUnavailableRedirect)),
    ],
  });
  return TestBed.inject(Router);
}

function lastRouteTitle(router: Router): unknown {
  let route = router.routerState.snapshot.root;
  while (route.firstChild) route = route.firstChild;
  return route.title;
}

describe('manifest-derived routing and the remote error boundary', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('activates a remote whose routes load', async () => {
    const router = setup(fakeLoader(async () => [{ path: '', component: RemoteHome }]));
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');

    await router.navigateByUrl('/iam');
    expect(router.url).toBe('/iam');
  });

  it('redirects a failed load to the boundary, preserving the attempted URL', async () => {
    const router = setup(
      fakeLoader(async (name) => {
        throw new RemoteUnavailableError(name, 'entry', 'remoteEntry.json unreachable');
      })
    );
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');

    await router.navigateByUrl('/iam');

    expect(router.url).toBe('/unavailable/iam?returnUrl=%2Fiam');
  });

  /**
   * The core of ADR-0007. The router caches whatever a loadChildren promise
   * RESOLVES with in `route._loadedRoutes`; a REJECTION is never cached. So the
   * boundary's Retry re-runs the real loader — no page reload, no resetConfig.
   */
  it('re-invokes the loader on retry, because a rejected load is never cached', async () => {
    const loader = fakeLoader(async (name, attempt) => {
      if (attempt === 1) throw new RemoteUnavailableError(name, 'entry', 'first attempt failed');
      return [{ path: '', component: RemoteHome }];
    });
    const router = setup(loader);
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');

    await router.navigateByUrl('/iam');
    expect(router.url).toBe('/unavailable/iam?returnUrl=%2Fiam');
    expect(loader.attempts['iam']).toBe(1);

    // what the boundary's Retry button does
    await router.navigateByUrl('/iam');

    expect(loader.attempts['iam']).toBe(2);
    expect(router.url).toBe('/iam');
  });

  it('never fetches a remote the user may not enter (canMatch runs before the load)', async () => {
    const loader = fakeLoader(async () => [{ path: '', component: RemoteHome }]);
    const router = setup(loader);
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('viewer');

    await router.navigateByUrl('/iam'); // admin-only

    expect(loader.attempts['iam']).toBeUndefined(); // never downloaded
    expect(router.url).toBe('/'); // redirected to the overview
  });

  it('sends away from the boundary a visitor who may not enter that domain', async () => {
    const router = setup(
      fakeLoader(async (name) => {
        throw new RemoteUnavailableError(name, 'entry', 'down');
      })
    );
    const auth = TestBed.inject(AtlasAuth) as MockAtlasAuth;
    await auth.login('admin');
    await router.navigateByUrl('/iam');
    expect(router.url).toBe('/unavailable/iam?returnUrl=%2Fiam');

    await auth.logout();
    await router.navigateByUrl(router.url, { onSameUrlNavigation: 'reload' });

    expect(router.url).toBe('/');
  });

  it('keeps the boundary for a failed remote this visitor may enter', async () => {
    const router = setup(fakeLoader(async () => [{ path: '', component: RemoteHome }]));
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('viewer');
    TestBed.inject(RemoteHealthStore).markDown('feature-flags', 'entry', 'down');

    await router.navigateByUrl('/unavailable/feature-flags');

    expect(router.url).toBe('/unavailable/feature-flags');
    expect(lastRouteTitle(router)).toBe('Unavailable');
  });

  it('opens the domain instead of calling a healthy remote unavailable', async () => {
    const loader = fakeLoader(async () => [{ path: '', component: RemoteHome }]);
    const router = setup(loader);
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('viewer');

    await router.navigateByUrl('/unavailable/feature-flags');

    expect(router.url).toBe('/flags');
    expect(loader.attempts['feature-flags']).toBe(1);
  });

  it.each(['no-such-remote', 'constructor', '__proto__', 'toString'])(
    'treats /unavailable/%s as an address nobody owns, signed in or not',
    async (name) => {
      const router = setup(fakeLoader(async () => []));

      await router.navigateByUrl(`/unavailable/${name}`);
      expect(router.url).toBe(`/unavailable/${name}`);
      expect(lastRouteTitle(router)).toBe('Page not found');

      await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('viewer');
      await router.navigateByUrl(`/unavailable/${name}`, { onSameUrlNavigation: 'reload' });
      expect(lastRouteTitle(router)).toBe('Page not found');
    }
  );

  it('keeps the rest of the platform working when one remote is down', async () => {
    const loader = fakeLoader(async (name) => {
      if (name === 'iam') throw new RemoteUnavailableError(name, 'entry', 'down');
      return [{ path: '', component: RemoteHome }];
    });
    const router = setup(loader);
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');

    await router.navigateByUrl('/iam');
    expect(router.url).toContain('/unavailable/iam');

    await router.navigateByUrl('/flags');
    expect(router.url).toBe('/flags');
  });

  it('leaves a non-remote navigation error alone', () => {
    setup(fakeLoader(async () => []));
    const unrelated = { error: new Error('something else'), url: '/iam' } as never;
    expect(remoteUnavailableRedirect(unrelated)).toBeUndefined();
  });

  /**
   * Pins the distinction as DELIBERATE rather than accidental.
   *
   * A forbidden route and an unknown one resolve differently. That is fine: the
   * manifest is fetched before authentication and lists every remote with its
   * `requiredRole`, so there is no existence to conceal — an earlier comment in
   * buildRoutes claimed the redirect hid it, which it never did and never
   * could. This test exists so that if someone later decides the two SHOULD
   * look alike, they change it on purpose and fix that comment, rather than
   * finding the difference by accident.
   */
  it('sends a forbidden route to the overview and an unknown one to the boundary', async () => {
    const router = setup(fakeLoader(async () => [{ path: '', component: RemoteHome }]));
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('viewer');

    await router.navigateByUrl('/iam'); // admin-only: forbidden
    expect(router.url, 'forbidden lands on the overview').toBe('/');

    await router.navigateByUrl('/definitely-not-a-remote'); // no such route
    expect(router.url, 'unknown keeps its own URL').toContain('/definitely-not-a-remote');
  });
});
