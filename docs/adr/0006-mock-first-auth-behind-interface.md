# ADR-0006: Mock-first auth behind a DI interface; standards-based OIDC as a drop-in later

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

Auth must exist from slice 1 (role-gated nav, cross-remote context propagation) but a real
identity provider (Supabase OIDC is the planned one) needs account provisioning and keys, and the
demo must keep working if that provider is down.

## Considered Options

1. **Abstract `AtlasAuth` + mock provider first (chosen)** — signal-based interface
   (`user`, `isAuthenticated`, `hasRole`, `login`, `logout`, async `init()` seam) as the DI
   token; `MockAtlasAuth` ships two personas (admin/viewer). Supabase OIDC implements the same
   interface in slice 3.
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

Checked 2026-07-08 (for the planned slice-3 provider): `@supabase/supabase-js` `latest=2.110.1`
(v3 only as `3.0.0-next.*` prerelease — avoided); Supabase free plan includes 50,000 MAU;
`auth.getClaims()` is current and recommended over `getUser()` for local JWT verification when
asymmetric signing keys are enabled.

## Amendment, 2026-09-05: the swap was ~80% a drop-in, and the rest is recorded honestly

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

**Role trust.** The role is read from `app_metadata` or a Custom Access Token Hook claim, and never
from `user_metadata`, which Supabase documents as editable by the user without checks. It is also
never read from the `role` claim, which is the Postgres role and is `authenticated` for everyone.
Anything unrecognised fails closed to `viewer`. This is the security-critical mapping in the change
and is covered by dedicated tests, including the two negative cases.

**Keeping the client out of the remotes.** `@atlas/shared-auth` deliberately does not import
Supabase. Adding one such file to that barrel would put the client in every remote's shared set,
because each remote's entry graph already reaches the lib. Four layers enforce it: the provider lives
in the shell; the three remotes list the packages in their federation `skip`; an
`@nx/enforce-module-boundaries` rule bans `@supabase/*` from every domain and shared lib (verified by
temporarily adding an import and watching lint fail); and a CI step greps the built remote bundles,
because only that can see a transitive path.

### Still blocked on provisioning

Everything above is verified with no Supabase account. What cannot be demonstrated until one exists:
the OAuth round trip, a real `TOKEN_REFRESHED` from an expiring token, JWKS verification (so
`getClaims()` falls back to a network call rather than local verification until asymmetric signing
keys are enabled), and writing `app_metadata.atlas_role` onto a user, which needs the service role.

## References

- https://supabase.com/docs/reference/javascript/auth-getclaims
