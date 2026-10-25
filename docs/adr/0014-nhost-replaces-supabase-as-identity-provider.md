# ADR-0014: Nhost replaces Supabase as the identity provider

- Status: accepted
- Date: 2026-10-22
- Deciders: Elbay Malik

Decided and merged across PRs #38–#42 (2026-10-22 to 2026-10-23); written up 2026-10-25, because
the code moved and no record did. Amends ADR-0006, which named Supabase as the planned provider, and
ADR-0011, whose verifier was pinned to Supabase's ES256 keys.

## Context and Problem Statement

ADR-0006 put auth behind `AtlasAuth` with the mock first and Supabase as the planned real provider.
Its 2026-09-05 amendment built that provider, and ADR-0011 built an edge verifier against Supabase's
token shape: ES256, an `aud` of `authenticated`, and a role read from `app_metadata`. Apart from PR
#22 confirming that the live project's JWKS published an EC P-256 key with `alg: ES256`, nothing in
the record shows a sign-in, a token or the role mapping exercised against a live Supabase project.
ADR-0006's "Still blocked on provisioning" section listed what was missing, and PR #39 says
production never served the Supabase manifest block.
A Supabase project ref (`pgrngevieiupeokdxwpa`) and its publishable key were committed in #22 and
removed from the tree in 47da3c6. They remain in git history.

Identity has now moved to Nhost. **Why Supabase was dropped is not recorded**: no PR body or commit
message gives a reason, and this ADR will not supply one after the fact. The closest the record
comes is PR #39 calling the old manifest block "dead config for an abandoned project". What follows
records what the move cost and what it changed, which the record does document.

The problem this ADR answers is narrower than "which vendor". Every layer that touches identity was
written against one vendor's token and SDK shape. Each had to be re-derived from the new provider's
**observed** behaviour, not from its documentation, and each gate had to keep working when the vendor
it was written for went away.

## Decision Drivers

- The edge must verify the tokens the provider actually mints. A verifier configured for claims that
  never arrive fails every request, and every one of those requests carries a valid signature.
- The role rule stays one function shared by browser and edge (ADR-0011), and it fails closed.
- ADR-0006's boundary holds: no identity client reaches a remote, and the gates that enforce this must
  not only recognise the vendor being left.
- A manifest naming a provider the bundle no longer has must not boot on the mock. With the mock,
  any visitor picks their own role.

## Considered Options

There is no recorded comparison of Nhost against other vendors, so none is listed here. The options
below are the ones the PRs actually weighed, one set per decision.

**Edge algorithm** (PR #39)

1. **RS256 (chosen).** It keeps the asymmetric shape: `createRemoteJWKSet` stays, and no shared secret
   enters the Worker.
2. HS256. Nhost supports it, but it puts a shared secret in the Worker, and then the edge could
   **mint** the tokens it verifies.
3. ES256, as before. Not actually available: Nhost's auth service supports only HS\* and RS\*.

**Role source** (PR #40)

1. **`x-hasura-allowed-roles` contains `admin` (chosen).** The auth server mints this list from
   assigned roles, and the user cannot set it.
2. `x-hasura-default-role`. Rejected because of a measurement, not an argument: a real admin token
   carries `allowed-roles ["user","me","admin"]` and `default-role "user"`.

**Browser client** (PR #41)

1. **A hand-written REST client (chosen).** Every endpoint it calls was first exercised by hand
   against the real project.
2. The provider's JavaScript SDK. That is the conventional choice, but searching found its docs thin
   on exactly the two things that matter here: provider sign-in and session restore.

**The manifest between stages** (PR #39)

1. **Remove the `auth` block until the adapter lands (chosen).**
2. Repoint it at Nhost straight away. That would have committed a manifest the shell could not boot,
   because `provideIdentity` still threw for `kind: 'nhost'`.
3. Leave it on Supabase. That keeps dead config for an abandoned project.

## Decision Outcome

Nhost is the identity provider. The browser signs in through a hand-written REST client, and the
edge verifies RS256 tokens against Nhost's JWKS.

**Token verification at the edge** (`apps/shell-bff/src/verify.ts`, `apps/shell-bff/src/worker.ts`)

- `algorithms: ['RS256']`, `issuer` pinned, `requiredClaims: ['exp']`, `clockTolerance: 5`.
- The JWKS URL takes the form `https://<sub>.auth.<region>.nhost.run/v1/.well-known/jwks.json`.
  `worker.ts` loads it through `createRemoteJWKSet` with a per-URL cache at module scope;
  `verify.ts` only receives the injected `jwks` resolver.
- **Audience is not checked, and that is a removal, not an omission.** A real token's payload is
  exactly `exp, iat, iss, sub, "https://hasura.io/jwt/claims"`, with no `aud`. jose rejects a token
  without `aud` whenever an `audience` option is passed, so keeping the check would have returned
  401 for every production request. An audience says which of several consumers a token was minted
  for. This issuer serves one project and one consumer, and the pinned issuer carries "minted for us"
  instead. `ATLAS_JWT_AUDIENCE` is gone from every wrangler config and from the parity list. If the
  provider is ever set up to emit an audience, the check goes back in. It should not stay configured
  and unenforced.

**Claims** (`libs/shared/contracts/src/lib/claims.ts`, shared by browser and edge)

- Every custom claim is read from the `https://hasura.io/jwt/claims` namespace.
- The role is `admin` only when `x-hasura-allowed-roles` contains `'admin'`. Anything else is
  `viewer`. `x-hasura-default-role` is deliberately not read.
- Email comes from `x-hasura-email`, and is `''` when absent. Display name comes from **both**
  `x-hasura-display-name` and `x-hasura-displayname`, falling back to email and then to `sub`. A
  display name carries no authority and never reaches `toAtlasRole`.

**Browser client** (`apps/shell/src/app/auth/`)

- `NhostIdentityClient` implements `identity.port.ts` (`ATLAS_IDENTITY` / `AtlasIdentityClient`). It
  replaces `gotrue.port.ts`, whose signatures carried a vendor's `{ data, error }` wrappers.
  `TokenAtlasAuth` replaces `SupabaseAtlasAuth`, and its logic is unchanged.
- Endpoints:
  - `GET {base}/signin/provider/{provider}?redirectTo={origin}/`
  - `POST {base}/token` with `{ refreshToken }`
  - `POST {base}/signout`
- The response shape is pinned to what the live endpoint returns:
  `{ accessToken, accessTokenExpiresIn, refreshToken, refreshTokenId, user }`.
- What the SDK would have provided, written deliberately:
  - The redirect's `refreshToken` is read from the query or the hash and stripped with
    `history.replaceState` **before** the exchange, so a failed exchange does not leave it in the
    address bar.
  - The refresh token is rotated on every exchange.
  - Refresh runs 60s before expiry, never sooner than 5s from now.
  - Concurrent refreshes are merged into one request.
  - The rotated refresh token, and only that, is stored in `localStorage` under `atlas.auth`. The
    access token, its expiry and its claims are held in memory.
- `provideNhostAtlasAuth` has no dynamic import. There is no SDK, so the lazy boundary the previous
  provider needed has no cost left to avoid.

**Manifest** (`libs/shared/contracts/src/lib/manifest.ts`, `tools/check-manifests.mjs`)

- `AtlasAuthConfig` gains `kind: 'supabase' | 'nhost'`. An absent kind means `supabase`.
- For `nhost`, `publishableKey` must be **absent**, and an empty string is refused as well. The rule
  is categorical because it has to be: Nhost needs no browser key, and its admin secret is an
  unprefixed random string. No shape check could tell it from a legitimate value, the way
  `looksLikeSecretKey()` recognises `sb_secret_`.
- `check-manifests.mjs` `issuerMismatch()` fails when the Worker's `ATLAS_JWT_ISSUER` does not start
  with the origin of the manifest's `auth.url`. These two halves deploy independently (ADR-0010), and
  a mismatch between them makes every call return 401.
- The production manifest reads `{"kind":"nhost","url":"https://znphjikmxtijqhgsbkon.auth.eu-central-1.nhost.run/v1","provider":"github"}`.

**The retired provider fails loudly** (`apps/shell/src/bootstrap.ts`, `provideIdentity`)

- `kind: 'supabase'`, or no kind at all, **throws** at bootstrap: "auth.kind "supabase" is no longer
  supported … Refusing to boot rather than falling back to the mock."
- A manifest ships independently of the bundle, so one naming the old provider can outlive its
  implementation. If bootstrap fell back instead, the result would be the mock paired with real
  remotes.
- A manifest with no `auth` block still gets the mock, deliberately.

**The boundary gates** (ADR-0006)

- `check-remote-bundles.mjs` is now keyed by vendor:
  - `supabase: ['GoTrueClient','@supabase/']`
  - `nhost: ['@nhost/','nhost-js','hasura-auth']`
- As merged, the three remotes' federation `skip` lists keep `@supabase/auth-js`,
  `@supabase/supabase-js` and `@nhost/nhost-js` as tripwires. There is no package to skip today. The
  follow-up docs branch drops the two Supabase entries, because `skip` only matters for an installed
  dependency, and keeps `@nhost/nhost-js`.
- **None of these needles can see the current client.** It is not an SDK, so a remote that bundled
  the shell's own client would be caught only by the module-boundary rules, which refuse any import
  of an app project. The bundle check guards against SDKs, and the current client is not one.

### Consequences

- Positive: **the shell has no identity dependency at all.** `@supabase/auth-js` is removed, nothing
  replaces it, and the only auth-related package is `jose`, which only the edge uses. ADR-0006's
  boundary is now easier to hold, because a dependency that does not exist cannot leak into a
  remote. `bundles:check` still greps for both vendors in case one is ever added.
- Positive: every claim rule and fixture was built from real tokens captured during the migration,
  not from the provider's documentation. Two of those observations would each have broken production
  if the code had followed the docs or convention: the missing `aud`, and the admin whose default role
  is `user`.
- Positive: the port is now written in the shell's terms rather than a vendor's. Swapping providers
  again means writing a new adapter, not refactoring the port.
- Negative: **the client is ours to maintain.** Rotation, refresh timing, coalescing and redirect
  pickup are this repo's code, tested by this repo's tests. If the provider changes its token
  endpoint's response shape, nothing outside this repository will notice.
- Negative: **claim key spelling is owned by a dashboard outside this repository.** The provider
  builds the claim key from the field name typed into the Nhost dashboard. That is why the code reads
  `x-hasura-displayname` as well as the hyphenated `x-hasura-display-name`, which the project never
  emitted. Both are read so that renaming the dashboard field cannot silently blank the header. The
  same applies to `x-hasura-email`, which is read under one spelling only. Renaming that field would
  quietly turn audit entries back into `sub` values.
- Negative: **the validators and the bootstrap disagree on `supabase`.** `isAtlasManifest` and
  `check-manifests.mjs` still accept a well-formed supabase block (with its publishable-key and
  service-role checks). So a supabase manifest passes `manifest:check` and is then refused at boot. It
  fails safe, but late: the deploy gate passes something the runtime rejects. This comes from reading
  the code; no PR states it.
- Negative, until the follow-up lands: **as merged, eslint banned only `@supabase/*`.** In
  80bd90f, the `bannedExternalImports` rules for the scope:iam, scope:flags, scope:audit and
  scope:shared tags had no `@nhost/*` entry. The bundle check and the federation `skip` list covered
  the new vendor; the lint rule did not. The docs/nhost-record branch adds `@nhost/*` to all four.
  Until that merges, the gap stands.
- Negative: `provideNhostAtlasAuth` accepts a `provider` it never uses. Only `url` reaches
  `NhostIdentityClient`, and the header reads `manifest.auth.provider` directly. A manifest that sets
  `auth` without a `provider` therefore shows the mock persona buttons. Those call `login('admin')`,
  which requests `/signin/provider/admin`. This also comes from reading the code; no PR states it.
- Negative, and historical: between PR #39 and PR #41 the production manifest had no `auth` block. PR
  #39 stated the cost at the time: a deploy in that window would have run the mock provider against
  real remotes. That was tolerable only because `apiMode` was `mock`. The window closed when PR #41
  repointed the manifest.

## Verification

From the PRs, checked against the live project on 2026-10-22 and 2026-10-23:

- **JWKS** (PR #39): returns an `RSASSA-PKCS1-v1_5` public key under `kid f6de00eb-…`. An ES256
  lookup for that kid is refused.
- **Payload** (PR #39): a real access token's payload is exactly
  `exp, iat, iss, sub, "https://hasura.io/jwt/claims"`, with no `aud`.
- **Issuer cross-check** (PR #39): on its first run, `issuerMismatch()` failed `manifest:check`
  because the Worker named `…nhost.run/v1` while the manifest still named `…supabase.co`. That is
  exactly the failure it was written for.
- **Admin role** (PR #40): a real admin token reads `allowed-roles ["user","me","admin"]`,
  `default-role "user"`. PR #39 had earlier recorded tokens carrying only `["user","me"]`, which was
  before the project had an `admin` role.
- **Endpoints** (PR #41): the OAuth redirect, `POST /v1/token`, `POST /v1/signout` and `GET /v1/user`
  were exercised by hand. The pinned response shape comes from these calls.
- **Custom claims** (PR #42): a live token carries `x-hasura-email` and `x-hasura-displayname`, and
  both populate. PR #41 had listed them as not yet emitting.

In the suite (all 14 `ci:local` gates passed on each PR):

- **Algorithm confusion** (`verify.spec.ts`): the probe now signs with ES256 and expects the RS256 pin
  to refuse it. The test JWKS publishes **both** an RS256 and an ES256 key on purpose. A probe signed
  with an unpublished key would be stopped by the signature check and would prove nothing about the
  pin.
- **Audience** (`verify.spec.ts`): three tests pin the removal. A token with an unexpected audience is
  accepted, a token with no audience is accepted, and a token from another issuer is still refused.
  Putting the check back breaks a test instead of production.
- **Role**: each of these is refused admin:
  - `default-role: admin` without the allowed-roles entry (`verify.spec.ts` and `claims.spec.ts`)
  - a top-level `role` or `atlas_role` of `admin`, outside the namespace (`verify.spec.ts` and
    `claims.spec.ts`)
  - a display name of `"admin"` (`claims.spec.ts` only), under either key; the unhyphenated case was
    added in PR #42
- **Manifest** (`manifest-validator-parity.spec.mjs`): the two validators agree on the `kind` /
  `publishableKey` rules. `provide-identity.spec.ts` asserts that `supabase` throws.

Re-checked 2026-10-25 for this ADR:

- `grep -cE "@supabase|nhost"` returns 0 for both `package.json` and `pnpm-lock.yaml`.
- An orphaned `node_modules/.pnpm/@supabase+auth-js@2.115.0` store directory is still on disk. It is
  not in the lockfile.
- `provideNhostAtlasAuth` passes only `{ url: config.url }` to the client.

### Not demonstrated

- **The production redirect URL is not known to be allow-listed.** PR #41 listed it as required
  before a production deploy, and no later PR says it was done.
- **Nothing exercises the real HTTP path in production.** The production manifest's `apiMode` is
  `mock`, so the edge verifier has not judged a real request there.
- **E2e runs on the mock.** The dev manifest has no `auth` block, so no browser test drives a real
  sign-in.
- **Whether production is deployed with this manifest.** Nothing in the repository or the PRs shows a
  deploy.

## References

- PR #38 (vendor-neutral contract and gates), #39 (RS256 verifier, audience removal), #40
  (allowed-roles), #41 (REST client, Supabase removed), #42 (display-name key)
- ADR-0006, ADR-0010, ADR-0011
