# ADR-0006: Mock-first auth behind a DI interface; standards-based OIDC as a drop-in later

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

Auth must exist from slice 1 (role-gated nav, cross-remote context propagation) but a real
identity provider (Supabase OIDC is the planned one) needs account provisioning and keys, and the
demo must keep working if that provider is down.

**Update, 2026-10-25.** The provider is now Nhost, not Supabase (ADR-0014, PRs #38–#42). The
decision itself stands: the mock still ships first behind `AtlasAuth`, and the real provider
implements the same contract. Each Supabase passage below is kept as it was written and carries a
dated note saying what is now true.

## Considered Options

1. **Abstract `AtlasAuth` + mock provider first (chosen)** — signal-based interface
   (`user`, `isAuthenticated`, `hasRole`, `login`, `logout`, async `init()` seam) as the DI
   token; `MockAtlasAuth` ships two personas (admin/viewer). Supabase OIDC implements the same
   interface in slice 3. *(Update, 2026-10-25: Nhost does, through a hand-written REST client;
   see ADR-0014.)*
2. Supabase from day one — blocks slice 1 on external provisioning; no offline fallback.
3. Hand-rolled JWT server — most effort, least credible.

## Decision Outcome

Option 1. Auth context propagates to remotes **via the shared singleton service** (the
`@atlas/shared-auth` lib is a federation `sharedMapping`, so shell and remotes inject the same
instance) — never by passing tokens through events (leakage and race hazards). The
persona-visible-inside-a-remote check doubles as the federation singleton integration test.

### Consequences

- Positive: slice 1 unblocked; provider swap is a provider change, not a refactor; demo is
  resilient to provider outages.
- Negative: mock roles are not real security (documented as demo-grade); the interface must stay
  provider-agnostic.

## Verification

The receipts below are about Supabase and are kept as the record of what was checked at the time.
None of them describes the current provider (ADR-0014).

Checked 2026-07-08 (for the planned slice-3 provider): `@supabase/supabase-js` `latest=2.110.1`
(v3 only as `3.0.0-next.*` prerelease — avoided); Supabase free plan includes 50,000 MAU;
`auth.getClaims()` is current and recommended over `getUser()` for local JWT verification when
asymmetric signing keys are enabled.

## Amendment, 2026-09-05: the swap was ~80% a drop-in, and the rest is recorded honestly

*(Update, 2026-10-25: the Supabase provider this amendment describes was deleted in PR #41. Its
replacement is in ADR-0014. The two contract changes below (the login hint and `getAccessToken`) are
still in the contract, and the limitation in point 3 still applies to `TokenAtlasAuth`.)*

The real provider now exists (`apps/shell/src/app/auth/`), written against the same `AtlasAuth`
contract and fully unit-tested against a hand-written fake of the client. Implementing it tested the
claim above that "the provider swap is a provider change, not a refactor". Mostly true, with three
qualifications worth stating plainly, because two of them are changes to a contract shared across
every federation boundary.

**What held.** The async `init()` seam fits Supabase almost exactly: the client supports
`skipAutoInitialize`, so a single awaited `initialize()` covers both restoring a stored session and
completing an OAuth redirect, and `provideAppInitializer` gates first render on it. `logout()` was
already async. `hasRole()` is concrete on the abstract class and was inherited unchanged. The mock
still ships as the default, so the console runs with no identity provider at all.

**What did not, and had to change:**

1. `login(persona: MockPersona)` baked the mock's vocabulary into the shared contract. `'admin' |
   'viewer'` is meaningless to `signInWithOAuth`, so no real provider could satisfy that signature
   honestly. It is now `login(hint?: AtlasLoginHint)` — an opaque, provider-defined string. This is a
   widening, so every existing call site still compiles.
2. There was **no way to obtain a token**. The edge BFF needs a bearer token, and a remote can only
   reach auth through this shared singleton, so `getAccessToken()` had to be added to the abstract
   class. That is a federation contract change, not a provider change — precisely the kind of thing
   the original decision claimed would not be needed.
3. `hasRole()` is synchronous and is consumed from a `canMatch` guard. A cross-tab sign-out or a role
   downgrade on refresh updates the signal, but will **not** tear down a remote that is already
   activated. The provider re-verifies claims on every auth-state change rather than trusting the
   event, so the state is correct; enforcing it on already-open routes is a separate concern and is
   not solved here.

## Correction, 2026-09-23: the guard that keeps the token off other origins did not check origin

Adding `getAccessToken()` (point 2 above) put a live credential into a shared singleton that every
remote can inject, which makes the interceptor's URL guard the thing standing between that token and
every other origin the console talks to. Its own comment states the stake plainly: without it "the
token would ride along on cross-origin `remoteEntry.json` and chunk requests, i.e. this platform
would hand every remote's CDN a credential it has no business seeing."

It resolved the URL and then tested only the **pathname**:

```ts
const isApiCall = url.startsWith(API_PREFIX) || new URL(url, location.origin).pathname.startsWith(API_PREFIX);
```

`new URL('https://evil.example/api/steal', location.origin).pathname` is `/api/steal`, so that
returned true and the bearer token was attached. The check answered "does this look like an API
call" when the question is "is this credential going to the party it was minted for".

Nothing exploited it, because no code path in this repo issues an `HttpClient` request to a foreign
`/api/` URL — the federation runtime fetches remote entries through `importShim`, not `HttpClient`,
so the specific leak the comment describes was never reachable through this interceptor anyway. It
was a latent hole in a protection documented as load-bearing, not a live one.

**Why the suite did not catch it.** All four existing cases passed on the path test alone:
`/remoteEntry.json` and `/assets/api/thing.json` both fail `startsWith('/api/')` regardless of
origin, so the origin half could be deleted with everything green — the same shape as the ES256
pin in ADR-0011. The guard now compares `target.origin === location.origin` as well, fails closed on
an unparseable URL, and three new cases pin exactly that (`https://evil.example/api/steal`,
`http://localhost:4201/api/anything`, `https://iam.atlas.example/api/iam/users`). Verified by
restoring the path-only guard and watching precisely those three fail, and nothing else.

**Role trust.** The role is read from `app_metadata` or a Custom Access Token Hook claim, and never
from `user_metadata`, which Supabase documents as editable by the user without checks. It is also
never read from the `role` claim, which is the Postgres role and is `authenticated` for everyone.
Anything unrecognised fails closed to `viewer`. This is the security-critical mapping in the change
and is covered by dedicated tests, including the two negative cases.

**Update, 2026-10-25.** That mapping is gone along with Supabase. The role now comes from one
server-minted claim: `admin` when `x-hasura-allowed-roles` (inside the
`https://hasura.io/jwt/claims` namespace) contains `'admin'`, `viewer` otherwise.
`x-hasura-default-role` is deliberately not read: a real admin token carries `default-role "user"`.
User-editable fields, the display name among them, still never grant a role, and the rule still
fails closed. See ADR-0014 and `libs/shared/contracts/src/lib/claims.ts`.

**Keeping the client out of the remotes.** `@atlas/shared-auth` deliberately does not import
Supabase. Adding one such file to that barrel would put the client in every remote's shared set,
because each remote's entry graph already reaches the lib. Four layers enforce it: the provider lives
in the shell; the three remotes list the packages in their federation `skip`; an
`@nx/enforce-module-boundaries` rule bans `@supabase/*` from every domain and shared lib (verified by
temporarily adding an import and watching lint fail); and a CI step greps the built remote bundles,
because only that can see a transitive path.

**Update, 2026-10-25.** The boundary stands, but most of the paragraph above describes a vendor
that is no longer here. What is true today:

- **There is no identity package.** The provider is a REST client in the shell
  (`nhost-identity.client.ts`), and `@supabase/auth-js` was removed from `package.json`. No identity
  SDK has replaced it. The barrel risk described above remains possible in principle but has no
  package to act on today.
- **The `skip` entries are tripwires.** As of 39ab442, the three remotes listed `@supabase/auth-js`,
  `@supabase/supabase-js` and `@nhost/nhost-js`, with a comment noting there was no package to skip;
  #43 dropped the Supabase entries and kept only `@nhost/nhost-js`.
- **As of 39ab442, the lint rule banned only `@supabase/*`**, so the verified-by-adding-an-import
  receipt above covers the old vendor only. #43 added `@nhost/*` to the same four scopes. The client
  the shell actually uses lives in `apps/shell`, and the scope constraints plus Nx's refusal to
  import an app project keep it out of the remotes and shared libs. No package ban names it, so this
  holds only while the file stays where it is: moved into a shared lib and used by iam, the client
  imported nothing banned, and lint passed (2026-10-25 probe).
- **As of #43, the bundle grep was keyed by vendor.** It checked `GoTrueClient` and `@supabase/` as
  before, and added `@nhost/`, `nhost-js` and `hasura-auth` (PR #38). The old list would have kept
  passing green if a remote had bundled a different vendor's client, and no needle matched the
  hand-written client either.
- **Since this change (2026-10-25), the bundle grep also looks for the hand-written client.** It
  greps every remote for two strings from `nhost-identity.client.ts`, and fails if either is missing
  from the client source or the shell build. Exported from `@atlas/shared-auth`, the client failed the gate in iam and
  feature-flags. It catches the current client by its strings only; ADR-0014 records the receipts and
  the remaining limits.

Also worth recording against amendment point 1: widening `login()` to an opaque hint did not stop the
header passing `'admin'` / `'viewer'` as that hint. A real provider reads the hint as an OAuth
provider name, so both buttons would have failed against Supabase too, and no one noticed because
that config was never deployed. PR #41 fixed it: the header shows one "Sign in with <provider>" button
(rendered "Sign in with Github" for the production manifest) when the manifest names a provider, and the persona buttons only for the mock.

### Still blocked on provisioning

Everything above is verified with no Supabase account. What cannot be demonstrated until one exists:
the OAuth round trip, a real `TOKEN_REFRESHED` from an expiring token, JWKS verification (so
`getClaims()` falls back to a network call rather than local verification until asymmetric signing
keys are enabled), and writing `app_metadata.atlas_role` onto a user, which needs the service role.

**Update, 2026-10-25.** Against Supabase, the record shows one partial check: PR #22 confirmed the
live project's JWKS published an EC P-256 key with `alg: ES256`, matching the pin. Nothing shows the
OAuth round trip, a real refresh, a token verified against that JWKS, or the `app_metadata` write. A project ref and publishable key were later committed (#22), but PR #39 says production
never served that manifest block. The provider in use now is Nhost (ADR-0014). Against its live
project:

- The OAuth redirect and the token, sign-out and user endpoints were exercised by hand.
- The JWKS was checked: it returns an RSA (RS256) key, and an ES256 lookup for the same kid is refused.
- A real admin token carries `admin` in `x-hasura-allowed-roles`. That replaces the
  `app_metadata.atlas_role` model, so no service role is needed.

Still not demonstrated: production runs `apiMode: "mock"`, so no real request has been verified at
the edge there. (The production redirect URL listed here until 2026-10-25 is now allow-listed, and a
production sign-in completed by hand; ADR-0014 has the receipts.)
ADR-0014's "Not demonstrated" section is the current list.

## References

- https://supabase.com/docs/reference/javascript/auth-getclaims (historical: the provider this ADR
  originally planned)
- ADR-0014: Nhost replaces Supabase as the identity provider
