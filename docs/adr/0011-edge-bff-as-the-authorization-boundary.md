# ADR-0011: The edge BFF is the authorization boundary; the client only hides things

- Status: accepted; amended 2026-10-25 (verifier moved to Nhost, ADR-0014)
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
- Verification uses **`jose` against the project's JWKS**, with `algorithms` pinned to `RS256` and
  the issuer checked. As first decided this read `ES256`, with issuer *and audience* checked; both
  changed with the move to Nhost, and the amendment dated 2026-10-25 below says why. The signature
  check is the easy fifth of a correct verifier; the rest is algorithm allowlisting, `kid` selection
  across a rotating key set, and claim validation. Hand rolling that would be a worse artifact, not a
  leaner one.
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
- Negative, and stated because it was found rather than designed: **deactivating a user does not
  revoke their token.** Nothing on the request path consults the directory's `active` flag for the
  *caller* — only for the target of a mutation — so a deactivated admin keeps administering until
  their token expires. Not fixed here on purpose: the correct place to answer "is this principal
  still allowed in" is the identity provider (short token lifetimes plus revocation), and the
  alternative is having the edge re-read a user directory that is currently an in-memory demo store
  on every request, which would encode the wrong architecture to close a gap the provider closes
  better. It is written down because it is exactly what makes the `&& u.active` clause in
  `wouldRemoveLastAdmin` load-bearing: a deactivated admin still holds a working token, so counting
  them as cover for a live admin is how a platform reaches zero usable administrators.
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

Checked 2026-09-05. The last two bullets describe the **pre-migration** verifier, written for
Supabase; they are kept as the receipt they were, and the amendment dated 2026-10-25 records what
replaced them.

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

## Correction, 2026-10-21: an expiry was never required, only checked when present

Found by an adversarial audit. The list above says rejection is asserted for "an expired token",
and it is — but `jwtVerify` only validates an `exp` that is **present**. A token minted without one
is not expired, and never becomes expired, so it verified **forever**.

The suite could not notice. Its token factory always called `.setExpirationTime(...)`, so every
token it had ever produced carried an expiry; the one shape that mattered was unreachable from the
tests. That is the same shape as the ES256 pin above — a protection nothing probed — except here the
protection did not exist at all rather than merely being untested.

`requiredClaims: ['exp']` now makes the claim mandatory. Two cases pin it: a token minted with
`expiresIn: false` is refused, and an otherwise identical token that does carry an expiry is still
accepted, so the refusal is demonstrably about the missing claim and not about something incidental.
Verified by deleting `requiredClaims` and watching exactly one test fail.

The distinction worth keeping: *"this token is still valid"* and *"this token was never given a
lifetime"* are different statements, and only the first is what an expiry check answers.
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

**Correction, 2026-10-22.** That sentence was one third true when written. The interceptor was
covered; the HTTP implementations and the mode selection were not — no spec referenced
`FlagsHttpApi` or `provideFlagsApi`, so the code that talks to the edge and the switch deciding
whether to use it could both have been deleted with the suite green. They are small surfaces, which
is precisely why they went uncovered and why the claim was easy to leave standing.

Now genuinely covered (`flags-api.spec.ts`): the `{ flags }` envelope is unwrapped, the PATCH body
and URL are asserted, a key containing a slash is encoded so it cannot change which route it
addresses, and the URL stays relative so the interceptor recognises it as same-origin. Mode
selection is asserted in all three states — `http`, `mock`, and nothing provided at all, which must
fall back to the mock so a remote loaded outside the shell never starts calling an edge that is not
there.

Two more gaps from the same audit, both in this file's subject:

- **`matchRoute`'s malformed-percent-encoding guard had no test.** `decodeURIComponent('%')` throws,
  and `matchRoute` runs *before* authentication, so an uncaught throw escapes as a workerd error
  page rather than the JSON this API documents — the exact defect recorded above as found and fixed,
  with nothing stopping its return. Seven cases now pin it; removing the `try/catch` fails all seven.
- **`config-parity.spec.ts` compared the two wrangler configs only to each other.** A var dropped
  from *both* leaves them equal and the test green. That is worse than a missing value normally is:
  jose validates `issuer` and `audience` only when those options are **defined**, and silently skips
  the check when they are not. Dropping those vars would not break the verifier loudly — it would
  quietly stop checking who issued the token. The three vars the Worker reads are now asserted
  absolutely, not merely identically. *(Since PR #39 there are two, `ATLAS_JWKS_URL` and
  `ATLAS_JWT_ISSUER`: the audience check and its var were removed on purpose, and
  `config-parity.spec.ts` says so in place, so the absence reads as a decision rather than as the
  omission that test exists to catch. See the amendment dated 2026-10-25.)*

### Not demonstrated without a Supabase project (pre-migration; superseded 2026-10-25)

As written before the move to Nhost: the configured JWKS URL, the real issuer string, that the
provider ever mints `atlas_role`, and any real token refresh. The local-key tests prove the verifier
is correct; they cannot prove it is pointed at the right place. The amendment below records which of
these are now demonstrated against Nhost and which are not.

## Amendment, 2026-10-25: Nhost replaces Supabase, so the verifier pins RS256 and drops the audience check

Identity moved from Supabase to Nhost across PRs #38–#42; ADR-0014 records that decision. This ADR's
decision — the edge is the authorization boundary, the role is re-derived server-side by one shared
function — is unchanged. Three things the verifier does are not, and each is pinned by a test.

**The pin is `RS256`, not `ES256`** (PR #39). Nhost's auth service supports only HS\* and RS\*
algorithms, so the original pin could never have verified one of its tokens. RS256 keeps the
asymmetric shape: `createRemoteJWKSet` stays, no shared secret enters the Worker, and the edge does
not gain the ability to *mint* the tokens it verifies, which HS256 would have handed it. The
algorithm-confusion probe reversed direction with it. It used to sign with an RSA key to prove
`['ES256']` refused it; it now signs with an ES256 key the test JWKS genuinely publishes, alongside
the RS256 signing key, to prove `['RS256']` refuses it. The EC key stays published on purpose — a
probe signed with an unpublished key is stopped by the signature check and proves nothing about the
pin.

**The audience is deliberately not checked** (PR #39). A real Nhost access token's payload is exactly
`exp, iat, iss, sub, "https://hasura.io/jwt/claims"`, with no `aud`, and jose rejects a token
without one whenever an `audience` option is passed. Keeping the check would have returned 401 for
every request in production, each with a valid signature. What it bought rests on the issuer
instead: an audience distinguishes between several consumers of one issuer, and this issuer serves
one project and one consumer. The cost is stated rather than hidden: if the issuer ever serves a
second consumer, a token minted for it would verify here. Putting the `audience` option back does
not close that gap on its own — while the provider mints no `aud`, it would 401 every token again.
Closing it means configuring the provider to emit an audience first; `verify.ts` says to restore the
check once one is emitted, and not to leave it configured-but-unenforced. Three tests pin the
removal: a token naming an unexpected audience is accepted, a token with none is accepted, and a
token from another issuer is still refused.

**The role comes from `x-hasura-allowed-roles`** (PR #40), read inside the
`https://hasura.io/jwt/claims` namespace by the same `toAtlasRole` in `@atlas/shared-contracts`:
`admin` when that list contains `'admin'`, `viewer` otherwise. Not `x-hasura-default-role` — a real
admin token reads `allowed-roles ["user","me","admin"]` with `default-role "user"`, so reading the
default role would have made a genuine admin a viewer, and failing closed would have made that look
like correct behaviour. The negative cases now refused admin are a `default-role: admin` without the
allowed-roles entry, a role placed at the top level outside the namespace, and a display name of
`"admin"`. These replace the pre-migration cases above, which asserted that `user_metadata` and the
database `role` claim were ignored.

Unchanged: `issuer` is pinned, `requiredClaims: ['exp']` still refuses a token with no lifetime, and
`clockTolerance` is 5 seconds.

### What is and is not demonstrated against Nhost

Demonstrated, per PRs #39 and #40, against the live project rather than its documentation:

- **The JWKS source.** `ATLAS_JWKS_URL` in `apps/shell/wrangler.jsonc` points at
  `https://znphjikmxtijqhgsbkon.auth.eu-central-1.nhost.run/v1/.well-known/jwks.json`, loaded
  through `createRemoteJWKSet` with a per-URL cache at module scope. Fetched live, it resolves to an
  RSASSA-PKCS1-v1_5 key under `kid f6de00eb-…`, and an ES256 lookup for that kid is refused.
- **The issuer string.** `ATLAS_JWT_ISSUER` is
  `https://znphjikmxtijqhgsbkon.auth.eu-central-1.nhost.run/v1`. `tools/check-manifests.mjs` now
  fails when it does not start with the origin of the manifest's `auth.url`, and caught a
  Supabase/Nhost mismatch on its first run.
- **The claim shape.** A real token's payload, its lack of `aud`, and a real admin token whose
  allowed-roles include `admin`. Test fixtures are built from captured tokens.

Still not demonstrated:

- **A real token reaching the edge in production.** Production's `apiMode` is `mock`, so the
  remotes serve fixtures and no browser in production sends a bearer to `/api/*`. The verifier is
  correct and pointed at the right place; nothing yet shows it doing that job on real traffic.
- **A real token refresh through the console.** The identity client's refresh path is unit-tested.
  Production sign-in completed by hand on 2026-10-25 (ADR-0014), but no refresh has been observed.
- **Revocation.** Deactivation still does not revoke a token (Consequences, above); nothing in the
  migration changed that.
- Until 2026-10-25 this list also asked whether production ran the Nhost manifest. It did not; the
  Workers had last deployed before #38. All four were redeployed that day (ADR-0014).

## Update, 2026-11-07: production serves assets only while `apiMode` is `mock`

The Decision Outcome above describes the shell's Worker with `main` and
`assets.run_worker_first: ["/api/*"]`. Production no longer deploys that way. While the production
manifest says `apiMode: "mock"` the console never calls `/api`, so `apps/shell/wrangler.jsonc` now
names neither key and no production request runs Worker code; the shell is an assets-only Worker
like the three remotes. The `ASSETS` binding went with them, because wrangler refuses an assets
binding on a Worker with no script. Nothing in the BFF changed.

- The BFF is still built and tested: `apps/shell-bff` runs against `wrangler.test.jsonc` with
  `run_worker_first: ["/api/*"]`, under the same compatibility date and `not_found_handling`, so the
  routing it was designed for is still what its tests exercise.
- `config-parity.spec.ts` accepts the assets-only shape, requires `main`, `run_worker_first` and the
  binding to come back together, and holds them to the tested values when they do.
- Switching production to `apiMode: "http"` re-adds the three keys. `manifest:check` refuses a
  manifest that says `http` while `apps/shell/wrangler.jsonc` lacks any of them.
- The vars `ATLAS_JWKS_URL` and `ATLAS_JWT_ISSUER` stay in the shell's config, so the switch is three
  lines and `manifest:check` can keep comparing the issuer with the manifest's `auth.url`.
- "Still not demonstrated" above stands, and more plainly: no BFF runs in production today.

## References

- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://developers.cloudflare.com/workers/static-assets/binding/
- ADR-0014: Nhost replaces Supabase as the identity provider
