import { inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  NavigationError,
  RedirectCommand,
  Route,
  Router,
  TitleStrategy,
  provideRouter,
  withNavigationErrorHandler,
} from '@angular/router';
import type { NativeFederationResult } from '@angular-architects/native-federation-v4';
import { AtlasAuth, provideAtlasAuth, provideAtlasHttp } from '@atlas/shared-auth';
import { ATLAS_API_MODE, AtlasApiMode } from '@atlas/shared-util';
import {
  ATLAS_MANIFEST_VERSION,
  AtlasAuthConfig,
  AtlasManifest,
  isAtlasManifest,
} from '@atlas/shared-contracts';
import { provideNhostAtlasAuth } from './app/auth/provide-nhost-auth';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { App } from './app/app';
import { AtlasTitleStrategy } from './app/atlas-title.strategy';
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
      // The tab title comes from the manifest too, so renaming a domain there
      // renames its tab with no shell rebuild (ADR-0004).
      title: def.displayName,
      canMatch: [() => inject(AtlasAuth).hasRole(def.requiredRole)],
      loadChildren: () => inject(RemoteLoader).load(name),
    },
    // Same path, no guard: reached only when canMatch above declined, i.e. the
    // user may not enter this domain. It sends them to the overview, which is
    // somewhere useful, instead of letting the catch-all render "not found" at
    // a URL that does exist.
    //
    // This does NOT hide whether the remote exists, and an earlier version of
    // this comment claimed it did. A forbidden route redirects to '/' while an
    // unknown one renders the boundary at its own URL, so the two are plainly
    // distinguishable. More to the point, there is nothing to hide:
    // federation.manifest.json is fetched before authentication and lists every
    // remote with its `requiredRole` — it has to, because the shell builds its
    // router and its nav from it (ADR-0004). Existence is public by design.
    //
    // What actually protects the domain is elsewhere and unaffected: `canMatch`
    // means the remote is never downloaded, and the edge BFF refuses the data
    // regardless of what the browser believes (ADR-0011).
    { path: def.route, redirectTo: '' },
  ]);

  return [
    { path: '', pathMatch: 'full', title: 'Overview', component: Overview },
    ...remoteRoutes,
    { path: 'unavailable/:remote', title: 'Unavailable', component: ModuleUnavailable },
    { path: '**', title: 'Page not found', component: ModuleUnavailable },
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

/**
 * Chooses the identity provider for the configured `auth.kind`.
 *
 * The switch is exhaustive on purpose: adding a kind to AtlasAuthKind without
 * adding a branch here will not compile. That is the point — the alternative
 * is a `kind` the shell quietly does not recognise.
 *
 * It throws rather than degrading because of what the degradation would be. A
 * manifest that FAILS the contract already falls back to zero remotes, which
 * makes the mock provider harmless: mock auth with nothing to reach cannot
 * grant access to anything. But a manifest that PASSES the contract keeps its
 * remotes — so falling back here would pair real domains with a provider where
 * any visitor picks their own role. Refusing to boot is the safe failure; a
 * console that comes up with mock auth over real remotes is not.
 */
export function provideIdentity(auth: AtlasAuthConfig | undefined) {
  if (!auth) return provideAtlasAuth();

  const kind = auth.kind ?? 'supabase';
  switch (kind) {
    case 'nhost':
      return provideNhostAtlasAuth({ url: auth.url, provider: auth.provider });
    case 'supabase':
      // The implementation is gone, and this branch is what stops that being a
      // silent downgrade. A manifest still naming the old provider must fail
      // loudly rather than boot on the mock, where any visitor picks their role.
      throw new Error(
        'auth.kind "supabase" is no longer supported — this build has no Supabase ' +
          'provider. Refusing to boot rather than falling back to the mock.'
      );
    default: {
      const unreachable: never = kind;
      throw new Error(`unknown auth.kind ${JSON.stringify(unreachable)}`);
    }
  }
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
      { provide: TitleStrategy, useClass: AtlasTitleStrategy },
      // WHICH identity provider is a deployment decision, exactly like apiMode
      // (ADR-0010): an environment that configures `auth` gets the real one,
      // and everything else — a fresh checkout, CI, a reviewer with no account
      // — keeps the mock. That is what lets this repo run with no identity
      // project at all while production's manifest names its Nhost project,
      // from the same bundle.
      provideIdentity(manifest.auth),
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
