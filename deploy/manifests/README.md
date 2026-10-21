# Environment manifests

One committed manifest per environment. These are **deployment inputs**, deliberately outside every
Nx target's inputs, so the environment can never become part of the build cache key (ADR-0010).
`tools/apply-manifest.mjs` copies the chosen one over the built shell immediately before upload.

Adding an environment is adding a directory here. Repointing a remote is editing one file and
re-uploading it — no rebuild, no shell redeploy.

`tools/check-manifests.mjs` validates every environment in CI. It is deliberately **stricter** than
the shell's runtime guard, so anything that passes CI is guaranteed to satisfy the shell. That
direction is enforced by `manifest-validator-parity.spec.mjs` rather than asserted in a comment —
it went stale once already, and the failure mode is a console that boots with zero remotes.

## Why production says `apiMode: "mock"`

The edge BFF is deployed (it shares the shell's Worker), but it verifies real OIDC tokens against a
JWKS endpoint, and there is no identity provider yet (ADR-0006). Pointing production at it would
mean every request answering 401. `mock` is therefore the correct value today, and it is written
out rather than left to the `absent means mock` default so that it reads as a decision — with a
single, reviewable place to change when a Supabase project exists.

## The deploy pre-flight

`node tools/check-manifests.mjs --require <env>` asserts that one NAMED environment exists, and the
deploy workflow runs it before a single upload. Plain `manifest:check` validates whatever manifests
happen to be present, which does not answer *"can this deploy proceed"* — and the workflow publishes
the three remotes two steps later. Selecting an environment with no manifest used to publish the
remotes and only then fail on the shell, leaving the platform half-deployed with newer remotes and
an older shell.

Adding an environment therefore means three things, not one: the directory here, the `options:` list
in `.github/workflows/deploy.yml`, and a check that the shell's `deploy` target does what that
environment needs.

## Why there is no `preview` environment yet

A path-routed preview (`/iam/remoteEntry.json`, one origin per pull request, so a single manifest
would serve every PR unchanged) needs an edge router that mounts each remote under a path on the
shell's origin. This repository deploys four **separate** Workers, one per app, each on its own
origin — so root-relative entries would resolve against the shell's origin and match no asset there.

`resolveRemoteUrls` already supports relative entries and is unit-tested for them, so the shell side
is ready. The missing piece is the router, which lands with the edge BFF.

The shell's `deploy` target does carry a `preview` configuration (`wrangler versions upload`), which
is the right primitive for when that lands. It is deliberately **not reachable** from the deploy
workflow today: there is no manifest for it to apply, and the pre-flight above would refuse the run
anyway. It stays as the shape of the eventual answer, not as a working path.
