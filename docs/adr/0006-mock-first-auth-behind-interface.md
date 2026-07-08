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

## References

- https://supabase.com/docs/reference/javascript/auth-getclaims
