# ADR-0004: Resolve remotes at runtime from federation.manifest.json, not build-time imports

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

The headline architectural claim of this platform is: *adding or repointing a remote is a
configuration change, not a shell rebuild*. Static federation (remote URLs compiled into the
shell) cannot deliver that.

## Considered Options

1. **Dynamic host + manifest (chosen)** — shell fetches `federation.manifest.json` at bootstrap,
   initializes federation from it, and derives both routes and navigation from its entries.
2. Static federation — remote URLs hard-coded per environment; every remote change redeploys the
   shell.
3. Hard-coded routes/nav with dynamic URLs only — halfway house; nav still requires shell code
   changes per remote.

## Decision Outcome

Option 1, with an **extended manifest schema** (`@atlas/shared-contracts`): each entry carries
`url`, `displayName`, `route`, `icon`, `exposedModule`, and `requiredRole`. The manifest is the
remote *registry*: the shell builds its router config and nav items from it, so enabling a remote
in an environment is a manifest edit. Per environment, only the manifest differs.

### Consequences

- Positive: independent deployability is real and demonstrable; failure isolation per remote
  (a bad URL degrades one nav entry, later slices add explicit fallback UI); environments are
  data, not builds.
- Negative: manifest schema is now a versioned contract; runtime fetch adds one request before
  bootstrap.

## Verification

Checked 2026-07-08: `@angular-architects/native-federation-v4@21.2.6` root entry exports
`initFederation(remotesOrManifestUrl, options)` returning `{ loadRemoteModule }` (the deprecated
top-level `loadRemoteModule` export is avoided), with `InitFederationOptions.sse?: boolean` for
dev auto-reload — confirmed in the package's `src/index.d.ts`.

Re-checked 2026-09-05, when real environments landed (ADR-0010): the "per environment, only the
manifest differs" promise is now exercised rather than asserted. `deploy/manifests/<env>/` holds one
committed manifest per environment, applied to the built artifact at deploy time, so a single shell
bundle is promoted unchanged and repointing a remote is a one-file upload. Manifest entries may now
be relative (`/iam/remoteEntry.json`) or absolute (`https://iam.atlas.example/remoteEntry.json`),
because `resolveRemoteUrls` absolutises them against the manifest's own URL before `initFederation`
sees them — the orchestrator does no such resolution itself. Relative support is unit-tested; it is
there for a future path-routed topology, which needs an edge router this repository does not deploy
yet (see `deploy/manifests/README.md`).

## References

- https://native-federation.com
