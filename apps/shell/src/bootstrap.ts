import { inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  NavigationError,
  RedirectCommand,
  Route,
  Router,
  provideRouter,
  withNavigationErrorHandler,
} from '@angular/router';
import type { NativeFederationResult } from '@angular-architects/native-federation-v4';
import { AtlasAuth, provideAtlasAuth, provideAtlasHttp } from '@atlas/shared-auth';
import { ATLAS_API_MODE, AtlasApiMode } from '@atlas/shared-util';
import { ATLAS_MANIFEST_VERSION, AtlasManifest, isAtlasManifest } from '@atlas/shared-contracts';
import { provideSupabaseAtlasAuth } from './app/auth/provide-supabase-auth';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { App } from './app/app';
import { FEDERATION } from './app/federation.token';
import { ATLAS_MANIFEST } from './app/manifest.token';
import { ModuleUnavailable } from './app/module-unavailable/module-unavailable';
import { Overview } from './app/overview/overview';
import { RemoteHealthStore } from './app/remotes/remote-health.store';
import { RemoteLoader, RemoteUnavailableError } from './app/remotes/remote-loader';

/**
 * Routes are derived from the manifest — adding a domain is a manifest edit,
 * never a shell rebuild (ADR-0004).
 *
 * Two deliberate choices (ADR-0007):
 * - `canMatch`, not `canActivate`: canMatch runs during recognition, BEFORE the
 *   remote is fetched, so a viewer typing an admin-only URL never triggers the
 *   download (and a failing role check falls through to the catch-all).
 * - `loadChildren` rejects on failure instead of resolving with fallback routes.
 *   The router caches anything a loader resolves with in `route._loadedRoutes`;
 *   a rejection is not cached, so Retry genuinely re-runs the load.
 */
export function buildRoutes(manifest: AtlasManifest): Route[] {
  const remoteRoutes = Object.entries(manifest.remotes).flatMap(([name, def]): Route[] => [
    {
      path: def.route,
      canMatch: [() => inject(AtlasAuth).hasRole(def.requiredRole)],
      loadChildren: () => inject(RemoteLoader).load(name),
    },
    // Same path, no guard: reached only when canMatch above declined, i.e. the
    // user may not enter this domain. Sending them to the overview (rather than
    // letting the catch-all render "not found" at the domain's own URL) keeps a
    // deep link to a forbidden remote indistinguishable from one that does not
    // exist — the remote was never fetched either way.
    { path: def.route, redirectTo: '' },
  ]);

  return [
    { path: '', pathMatch: 'full', component: Overview },
    ...remoteRoutes,
    { path: 'unavailable/:remote', component: ModuleUnavailable },
    { path: '**', component: ModuleUnavailable },
  ];
}

/**
 * Turns a rejected remote load into a navigation to the shell-owned boundary.
 * Returning a RedirectCommand makes the router emit NavigationCancel +
 * RedirectRequest instead of NavigationError, so the URL, the outlet and the
 * navigation promise all end up coherent without a reload. Anything that is not
 * a remote failure is left alone (undefined) and surfaces as a NavigationError.
 */
export function remoteUnavailableRedirect(error: NavigationError): RedirectCommand | undefined {
  if (!(error.error instanceof RemoteUnavailableError)) return undefined;
  return new RedirectCommand(
    inject(Router).createUrlTree(['/unavailable', error.error.remote], {
      queryParams: { returnUrl: error.url },
    })
  );
}

/**
 * ADR-0007: a malformed manifest degrades the platform to zero remotes; it must
 * never stop the console booting. main.ts already covers an unreachable
 * manifest — this covers one that parses but fails the contract.
 */
export function resolveManifest(rawManifest: unknown): AtlasManifest {
  if (isAtlasManifest(rawManifest)) return rawManifest;
  console.error(
    'federation.manifest.json does not match the expected contract — starting with no remotes'
  );
  return { version: ATLAS_MANIFEST_VERSION, remotes: {} };
}

export function bootstrap(rawManifest: unknown, federation: NativeFederationResult) {
  const manifest = resolveManifest(rawManifest);
  // Read from the VALIDATED manifest, never from the raw one. Reading it before
  // the guard would let a manifest that fails the contract still choose the
  // data source: the console would degrade to zero remotes AND carry an
  // out-of-contract apiMode. Deriving it here makes that unrepresentable.
  const apiMode: AtlasApiMode = manifest.apiMode ?? 'mock';
  return bootstrapApplication(App, {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(buildRoutes(manifest), withNavigationErrorHandler(remoteUnavailableRedirect)),
      // WHICH identity provider is a deployment decision, exactly like apiMode
      // (ADR-0010): an environment that configures `auth` gets the real one,
      // and everything else — a fresh checkout, CI, a reviewer with no account
      // — keeps the mock. That is what lets this repo run with no Supabase
      // project at all while production runs with one, from the same bundle.
      manifest.auth ? provideSupabaseAtlasAuth(manifest.auth) : provideAtlasAuth(),
      provideAtlasHttp(),
      // The mock auth cannot produce a token the edge would accept, so the data
      // source follows the auth provider (see api-mode.token.ts).
      { provide: ATLAS_API_MODE, useValue: apiMode },
      // The shell is the bus HOST; remotes inject AtlasEventBus and receive
      // this instance through federation sharing (ADR-0005).
      provideAtlasEventBus(),
      { provide: ATLAS_MANIFEST, useValue: manifest },
      { provide: FEDERATION, useValue: federation },
      provideAppInitializer(() => {
        // A remote missing from remoteInfoRepo failed its remoteEntry.json fetch
        // during initFederation, so the nav can show it as offline immediately.
        const repo = federation.adapters.remoteInfoRepo;
        inject(RemoteHealthStore).seed(Object.keys(manifest.remotes), (name) => repo.contains(name));
      }),
    ],
  });
}
