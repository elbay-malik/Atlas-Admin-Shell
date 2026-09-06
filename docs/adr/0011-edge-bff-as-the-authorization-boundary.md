# ADR-0011: The edge BFF is the authorization boundary; the client only hides things

- Status: accepted
- Date: 2026-09-05
- Deciders: Elbay Malik

## Context and Problem Statement

Until now every authorization decision in this platform happened in a browser. `AtlasAuth.hasRole()`
filters the navigation, and a `canMatch` guard decides whether a remote is even downloaded
(ADR-0007). That is good UX and no security at all: `canMatch` stops a download, not a `curl`.

Writing this slice surfaced how thin the line was. **A viewer could toggle a feature flag.** The
flags screen is viewer-visible by manifest, and `flags-home` never checked a role — it injected
`AtlasAuth` only to read the actor's email for the event payload. Nothing in the browser or anywhere
else refused the write, because there was no anywhere else.

## Decision Drivers

- Authorization has to hold against a request the UI never made.
- The browser and the edge must not drift on what "admin" means.
- The security-critical code has to be genuinely testable with no identity provider, or it is written
  rather than verified.

## Considered Options

1. **A Worker on the shell's own origin serving `/api/*` (chosen).**
2. A separate API Worker on its own hostname.
3. Per-remote APIs, one per domain.
4. Keep enforcing in the browser and treat the mock data as the product.

## Decision Outcome

Option 1. The shell's existing Cloudflare Worker gains `main` and
`assets.run_worker_first: ["/api/*"]`, so the same deployment serves the console and its API.

- **Same origin, so no CORS and no preflight on every mutation**, and — decisive under ADR-0010 — a
  relative `/api` base is not environment data, so nothing new enters the manifest.
- `run_worker_first` scopes the Worker to `/api/*` **only**. Every other path is served by asset
  routing exactly as before and never invokes the Worker, so the SPA deep-link fallback is unchanged.
- The Worker **builds its own JSON 404** for `/api` and any unmatched `/api/…` path, and wraps the
  whole API path in a catch-all so an unexpected throw still answers JSON. Both came out of the
  self-review: a bare `%` in a route parameter used to throw an uncaught `URIError` *before*
  authentication, escaping as a runtime error page rather than the documented JSON, and `GET /api`
  exactly fell through to the SPA fallback and returned HTML with a 200. Falling through to
  `env.ASSETS.fetch` would apply `not_found_handling`, returning `index.html` with a 200 — the same
  hazard the wrangler config already documents for chunks, and it would surface to a client as a
  confusing parse error rather than a 404.
- Verification uses **`jose` against the project's JWKS**, with `algorithms` pinned to `ES256` and
  issuer and audience checked. The signature check is the easy fifth of a correct verifier; the rest
  is algorithm allowlisting, `kid` selection across a rotating key set, and claim validation. Hand
  rolling that would be a worse artifact, not a leaner one.
- The role is **re-derived server-side** with `toAtlasRole`, moved into `@atlas/shared-contracts` so
  the browser and the edge consume one function. Two implementations of that rule would eventually
  disagree, and the disagreement would be a privilege bug.

**What the server enforces that the client cannot.** Not just the same rules again:

- `PATCH /api/flags/:key` is admin-only, closing the hole above. The UI now hides the affordance too,
  but the order matters — the server refuses regardless of what any client believes.
- The last remaining admin cannot be demoted or deactivated. The IAM screen shows an admin count, but
  that is a number on a page: two admins demoting each other in separate tabs would each see a
  safe-looking count. Only the server sees the whole picture.
- Nobody can demote or deactivate themselves.
- Mutations are idempotent, so an optimistic-UI retry cannot double-write the audit trail.
- **`POST /api/audit` does not exist.** Audit rows are written server-side as a side effect of a
  successful mutation, with the actor taken from the verified token and never from a request body. A
  client-writable audit log is not an audit log. The browser event bus that feeds the audit screen
  remains display only.

### Consequences

- Positive: authorization is real. The role rule has one implementation. The audit trail records who
  the token says acted, not who the caller claims to be.
- Negative: **a BFF deploy is now a shell deploy** — they share a Worker. If that becomes
  unacceptable the migration is an `apiBaseUrl` field on the manifest plus CORS, which is one field
  rather than a redesign. Domain state is in-memory per isolate; persistence is a later slice, and
  the boundary is what this one exists to prove.
- The Angular remotes now have both a mock and an HTTP implementation behind one contract, selected
  by `ATLAS_API_MODE`. That token lives in `@atlas/shared-util` for a reason worth recording: an
  InjectionToken's identity is the object, not its description, so declaring "the same" token in the
  shell and again in each remote yields DISTINCT tokens — the shell's choice is silently ignored and
  every remote falls back to its own default. That bug shipped past every unit test and was caught
  only by driving the real browser-to-BFF path.
- The mode is read from the manifest (`apiMode`), because it is environment configuration and
  ADR-0010 puts that in a deployment artifact rather than a build. It follows the auth provider: the
  mock auth mints a recognisably fake token, so "mock auth plus real API" could only ever produce
  401s. The default is mock, which keeps the console and the federation e2e suite runnable with no
  backend at all.

## Verification

Checked 2026-09-05:

- With `run_worker_first` set to an array, Cloudflare's own documentation states that non-matching
  requests "serve an asset that matches or serve the index.html fallback, without ever hitting this
  code" — so scoping to `/api/*` leaves the SPA fallback provably untouched.
- `env.ASSETS.fetch` applies `html_handling` and `not_found_handling`, which is why the Worker
  constructs its own 404 rather than delegating. Covered by a test asserting a JSON 404 with an
  `application/json` content type for `/api/nope`.
- The suite runs inside **real workerd** via `@cloudflare/vitest-plugin` against a test-only wrangler
  config, so it exercises the ASSETS binding and `run_worker_first` routing rather than a Node
  approximation. `wrangler deploy --dry-run` bundles the Worker on every pull request with no
  credentials — but it does **not** type-check it: wrangler bundles with esbuild, which strips types
  without checking them. A self-review caught that this ADR originally claimed otherwise, and a
  `typecheck` target now runs `tsc --noEmit` in CI. It found real errors the moment it was added,
  because nothing had ever type-checked the Worker.
- Because the tests use a separate wrangler config from the one that deploys, `config-parity.spec.ts`
  asserts the two agree on the load-bearing keys — compatibility date, `run_worker_first`,
  `not_found_handling`, the assets binding name and the declared vars. That does not remove the
  duplication; it makes a divergence fail loudly instead of silently changing production.
- JWT verification is covered end to end with **no identity provider**: the tests generate an ES256
  key pair, sign tokens, and serve the public half through a local JWKS. Rejection is asserted for a
  token signed by an unpublished key, an expired token, a wrong issuer, a wrong audience, an
  `alg: none` token, a tampered payload, a token with no subject, an empty bearer, and a malformed
  header. Role derivation is asserted to ignore both `user_metadata` and the database `role` claim.
- The `algorithms: ['ES256']` pin — the protection this verifier names as its reason for existing —
  originally had **no coverage at all**: the whole suite stayed green with the pin deleted. It is now
  probed with a token signed by an RSA key the JWKS genuinely publishes, so only the pin can refuse
  it. Verified by deleting the pin and watching that test, and only that test, fail.
- 49 BFF tests pass; 12 projects and 22 federation e2e specs remain green.

### What the browser-to-BFF coverage does and does not include

`apps/shell-bff-e2e` drives the real Worker over HTTP through `wrangler dev`, using a **dev-only
entry** (`worker.dev.ts`) that trusts the mock auth's fake token. That entry is named only by
`wrangler.dev.jsonc`; the deployed config points at `worker.ts`, so the bypass is not merely disabled
in production — it is not in the bundle, which `config-parity.spec.ts` asserts.

Those specs cover the API boundary: status codes, role enforcement, server-held state, and the
audit actor coming from the token. They deliberately do **not** drive the federated remote screens.
Loading three remotes through a cold `wrangler dev` while Nx was still building them proved flaky in
a way that reflected the harness rather than the product, and the federation suite already covers
those screens against static servers. The Angular half of the call — interceptor, HTTP
implementations, mode selection — is covered by unit tests, and the full path was verified manually
by tracing the browser's requests.

### Not demonstrated without a Supabase project

The configured JWKS URL, the real issuer string, that the provider ever mints `atlas_role`, and any
real token refresh. The local-key tests prove the verifier is correct; they cannot prove it is
pointed at the right place.

## References

- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://developers.cloudflare.com/workers/static-assets/binding/
