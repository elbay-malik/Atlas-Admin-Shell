# ADR-0007: Remote error boundaries — reject, never cache a fallback; recover by re-initialising the remote

- Status: accepted
- Date: 2026-09-05
- Deciders: Elbay Malik

## Context and Problem Statement

Slice 1 made a down remote survivable: `loadChildren` caught the failure and resolved with a
`ModuleUnavailable` route, so one bad remote could not take the console down. That fallback turned
out to be **permanent**. Angular's router writes whatever a `loadChildren` promise *resolves* with
into `route._loadedRoutes` and short-circuits every later navigation to that route, so once the
fallback was shown, the remote could never load again without a full page reload — even after the
remote came back. A platform whose headline claim is independent deployability cannot require a
browser reload to notice that a domain was redeployed.

Two further facts constrain any fix, and both were verified in the installed packages rather than
assumed:

- Native Federation's `initFederation` **skips** a remote whose `remoteEntry.json` cannot be
  fetched (it warns and continues in non-strict mode, which is the only mode the v4 wrapper
  exposes). Such a remote is simply absent from the registry, and a later `loadRemoteModule` fails.
- es-module-shims caches *failed* module loads by URL for the lifetime of the page. If the exposed
  chunk itself fails, re-requesting the same URL can never succeed in that page.

## Decision Drivers

- Retry must work **in the page**, with no reload, for the common case (a remote that was down when
  the shell started, or was mid-deploy).
- The user must be told which failure they hit, because the two failures have different recoveries.
- A remote the user has no role for must never be downloaded at all.

## Considered Options

1. **Reject from `loadChildren`, redirect to a shell-owned boundary, recover with
   `initRemoteEntry` (chosen).**
2. Keep resolving with fallback routes and purge the cache with `Router.resetConfig()` on retry.
3. Reload the page on every retry.

## Decision Outcome

Option 1.

- `loadChildren` calls `RemoteLoader.load(name)`, which **rejects** with a `RemoteUnavailableError`.
  A rejected loader is never written to `_loadedRoutes` and is re-invoked on the next navigation,
  so *retry is simply navigating again*.
- `withNavigationErrorHandler` turns that rejection into a `RedirectCommand` to
  `/unavailable/:remote?returnUrl=…`. Returning a redirect (rather than letting the error through)
  makes the router emit `NavigationCancel` + `RedirectRequest`, so the URL, the outlet and the
  navigation promise all stay coherent.
- `RemoteLoader` re-registers an unknown remote with `federation.initRemoteEntry(url, name)` and
  then **verifies with `adapters.remoteInfoRepo.contains(name)`**, because in non-strict mode
  `initRemoteEntry` swallows its own failures and resolves anyway. A short `fetch` probe with an
  `AbortSignal.timeout` runs first, since the orchestrator's own fetch has no timeout and a hung
  server would otherwise hang the navigation.
- Failures are classified. `reason: 'entry'` (the remote never registered) is retryable in-page.
  `reason: 'module'` (the chunk itself failed) additionally offers **Reload page**, because the
  module loader will not re-fetch that URL.
- Health per remote lives in a shell-owned `RemoteHealthStore`, seeded at bootstrap from the
  federation registry, so the navigation can mark a domain offline from first paint. The boundary
  auto-retries three times (1s/2s/4s, as a visible countdown) and then leaves it to the user.
- Role gating moved from `canActivate` to **`canMatch`**, which runs during recognition, *before*
  the remote is fetched; a sibling redirect route sends a denied deep link to the overview, so a
  forbidden domain is never downloaded and is indistinguishable from one that does not exist.
- A malformed or unreachable manifest no longer kills the shell: it boots with zero remotes.

Option 2 was rejected: `Router.config` holds the very route objects handed to `provideRouter`, and
`resetConfig` shallow-copies them, so `_loadedRoutes` survives unless brand-new objects are built —
and rebuilding drops the loaded routes and route-level injectors of every *healthy* remote too.
Option 3 throws away all client state for a failure that is usually transient.

### Consequences

- Positive: retry is genuinely in-page; a remote redeployed while the console is open is picked up;
  a forbidden remote costs no download; the failure the user sees names its own recovery.
- Negative: the boundary is now a real component with timers and state, and `remote.unavailable`
  events add bus traffic. Chunk-level failures still need a reload — an upstream limitation we
  surface honestly rather than hide behind a retry button that cannot work.

## Verification

Checked 2026-09-05 against the installed packages:

- `RouterConfigLoader.loadChildren` assigns `route._loadedRoutes` only **after** the awaited import
  succeeds, and its `finally` always deletes the in-flight promise — so a rejection leaves no cache
  and is re-invoked (`node_modules/@angular/router/fesm2022/_router-chunk.mjs:3406-3427`).
  Recognition short-circuits on `route._loadedRoutes !== undefined` (`:3100-3121`), which is why a
  *resolved* fallback is sticky. `Router.config` is `inject(ROUTES).flat()` with no copy and
  `resetConfig` spreads the same objects (`:4418-4420`, `:4526-4530`).
- A `RedirectCommand` returned from `withNavigationErrorHandler` suppresses `NavigationError` and
  emits `NavigationCancel` + `RedirectRequest` instead (`:3928-3947`).
- The orchestrator warns and skips an unreachable remote (`Could not fetch remote '<name>'.
  skipping init.`) because `strictRemoteEntry` defaults to false and the v4 wrapper cannot set it
  (`@softarc/native-federation-orchestrator@4.4.1` fesm2022 `:1378-1391`, `:2791`), and
  `initRemoteEntry` catches its own failure with `console.warn("Failed to initialize remote entry,
  continuing anyway.")` and resolves (`:2829-2836`) — hence the mandatory `remoteInfoRepo.contains`
  check (`:1931-1953`).
- es-module-shims 2.8.2 caches a failed load in `registry[url]` and never deletes it
  (`dist/es-module-shims.js:1192-1250`; no `delete registry[...]` exists in the file), and with the
  default `mapOverrides: false` it refuses to remap an already-composed specifier (`:450-460`) —
  the two reasons a chunk failure needs a reload.
- Angular 21.2.17 is zoneless by default (`ZONELESS_ENABLED` factory returns true), so the
  boundary's countdown is held in signals; a bare `setTimeout` would never repaint.

`apps/shell/src/app/remotes/remote-routing.spec.ts` locks the decision in: it asserts that a failed
load is re-invoked on the next navigation (attempt count goes 1 → 2 and the remote then activates),
that a denied deep link never reaches the loader, and that one down remote leaves the others usable.

## References

- https://angular.dev/api/router/withNavigationErrorHandler
- https://native-federation.com
