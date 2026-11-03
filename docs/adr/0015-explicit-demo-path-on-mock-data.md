# ADR-0015: Offer an explicit, labelled demo path when the data is mock

- Status: accepted
- Date: 2026-11-04
- Deciders: Elbay Malik

Sits beside ADR-0006 and ADR-0014 without amending them. ADR-0014's refusal to fall back to the mock
still holds, and this ADR depends on it.

## Context and Problem Statement

PRODUCT.md names the live URL, opened cold, as a primary way evaluators meet Atlas, and its first
principle is that the architecture must be visible. A signed-out production visitor could read the
Overview and go no further. Every remote needs GitHub sign-in, on a free Nhost project that sleeps,
and an account other than the author's gets `viewer`. So the screens that show a remote arriving
across origins could only be seen by someone willing to authorize a stranger's OAuth app, and
`/iam` not even then. The 2026-11-03 critique rated this the one P0.

ADR-0014 records why the obvious fix is dangerous: mock auth paired with real remotes lets any
visitor pick their own role, so a manifest naming a provider the bundle no longer has "must not boot
on the mock". A demo sits right next to that, so it has to be plainly a different thing and not a
softer version of the same fallback.

## Decision Drivers

- A visitor reaches `/iam`, `/flags` and `/audit` with no account, on the real federated remotes.
- A demo session is not a login. It holds no credential, and the edge verifier does not change.
- It must never be a fallback. Nothing but the visitor's own press starts it, and it stays visibly
  labelled on every route.
- It cannot exist when data is real (`apiMode: 'http'`), and that has to fail closed.
- A manifest naming an unknown or retired provider still refuses to boot.
- A real sign-in wins, in both directions: no state may look like the other.
- `bundles:check` stays meaningful, so nothing identity-related moves into a remote.

## Considered Options

1. **A demo session in the shell, wrapping the configured provider (chosen).** `DemoAtlasAuth`
   implements `AtlasAuth` in front of whichever provider the manifest selected, and exists in the
   injector only when the manifest's effective `apiMode` is `mock`.
2. **Add a third persona to `MockAtlasAuth`, or boot it when sign-in is unavailable.** This is the
   fallback ADR-0014 refuses. It would also store a persona, and it mints `mock.*` tokens, which
   `worker.dev.ts` accepts in development.
3. **Let Overview load one remote on demand, with no session.** The critique's alternative. It shows a
   module arriving but nothing past it: `/iam` stays locked behind the role, so the visitor still sees
   none of the domain screens.
4. **Lower the bar on sign-in.** Grant `viewer` screens without an account, or waken the provider
   first. Neither helps `/iam`, and the first means an unauthenticated role in the real role path.

## Decision Outcome

Option 1. The whole mechanism is `apps/shell/src/app/auth/demo-session.ts`, plus a press of the
labelled control on the signed-out Overview.

- **Availability.** `isDemoAvailable(manifest)` reads the manifest that already passed the contract
  guard: effective `apiMode` is `mock` and there is at least one remote. An out-of-contract `apiMode`
  has already become zero remotes, so it answers no. Otherwise `provideDemoSession` is never called
  and `DEMO_SESSION` is absent from DI, which is why every screen's control is absent too.
  `DemoAtlasAuth` also throws on construction if `ATLAS_API_MODE` is not `mock`.
- **Provider selection is untouched.** `provideIdentity` selects the provider first and layers the demo
  on top, so `kind: 'supabase'` and unknown kinds still throw.
- **No credential.** `getAccessToken()` answers `null` during a demo, so the interceptor adds no
  header. `isAuthenticated` stays the real provider's answer, so it is false. `verify.ts` is unchanged.
- **Role.** The demo user is built from literal claims through `toAuthUser`, so `toAtlasRole` remains
  the only source of a role. It holds `admin` because the point is to reach `/iam`. Those claims are
  never encoded into a token.
- **Nothing stored.** The demo lives in a signal. A reload ends it, and neither `atlas.auth.persona` nor
  anything else can start it.
- **Precedence.** `user` prefers the real provider's user whenever one exists, and seeing one ends the
  demo for good, so losing that session later lands on signed out, not back in the demo. A provider
  redirect ends it by leaving the page. A sign-in that fails to start leaves the visitor in the labelled
  demo with the failure reported in the shell notice.
- **Labelling.** A `demo` badge and Exit demo replace the name and role in the header, and a strip on
  every route says the edge BFF is not exercised. `mock data` sits in the header on every route under
  `apiMode: 'mock'`, for any session, not only the demo. `/audit` says its trail lives in this tab and
  clears on reload, also for any session under the mock.

### Consequences

- Positive: a cold visitor reaches every remote in one press, and the demo keeps working while the
  identity provider is asleep or broken.
- Positive: nothing moved into a remote. The audit note reads the `ATLAS_API_MODE` token the remote
  already imports. `libs/shared/auth` is unchanged.
- Negative: **any visitor can now appear as `admin` in production.** It is safe only because
  every write goes to a mock API in that tab, and `apiMode: 'mock'` is the entire reason it is safe.
  This is a client-side gate, so it has no authority by design (ADR-0011).
- Negative: **moving production to `apiMode: 'http'` removes the demo.** The two are mutually exclusive
  on purpose. The day data is real, cold visitors are back to needing an account, and this ADR offers no
  answer for that day.
- Negative: **the remote code now reaches visitors with no account.** `canMatch` used to mean a
  signed-out visitor never downloaded a remote. Those bundles were already public on their own origins,
  so this exposes nothing new, but the download is no longer gated in practice.
- Negative: **an evaluator can leave without seeing real auth or the edge.** The demo is the easy path,
  and the strip states what it does not prove, but no copy makes someone try the harder one.
- Negative: `user()` non-null with `isAuthenticated()` false is a state only this provider produces.
  Anything in a remote that reads `user()` treats a demo visitor as signed in, which is what lets the
  remotes work unchanged, and it is the reason the header has to check the demo first. So `/iam`'s
  session line does read `demo@atlas.dev (admin)`, under the header's `demo` badge and the strip.
- Negative: a reload ends the demo. A visitor reloading on `/iam` lands on the Overview and presses the
  button again, and it then returns them to `/iam`. Keeping it in `sessionStorage` would fix that, at
  the price of a stored way back into the demo.
- Negative: writes during a demo stay in the remote's in-memory mock until a reload. Re-entering the demo
  shows them. So does a mock persona signed in afterwards, which only local dev has: a real sign-in on
  production reloads the page.
- Negative: the strip costs about 115px of height on a phone, on every route.
- Negative: `mock` as the default for an absent `apiMode` now decides something else as well. A manifest
  that omits it offers the demo. `production` writes the value out (`deploy/manifests/README.md`).

## Verification

Run 2026-11-04 on branch `ui/demo-path`:

- `apps/shell/src/app/auth/demo-session.spec.ts`: no token, no `Authorization` header through the real
  interceptor, never authenticated, nothing stored, a stored persona does not start it, a real user wins
  and losing that user does not resume it.
- `apps/shell/src/app/provide-identity.spec.ts`: absent from the injector when not offered; throws if
  installed under `http`; `http` and out-of-contract manifests answer no; `supabase` and unknown kinds
  still throw with the demo offered.
- `apps/shell-bff/src/verify.spec.ts`: the production verifier answers 401 for no header, for
  `mock.demo.admin` and similar strings, and for a token claiming to be the demo user signed with an
  unpublished key. `apps/shell-bff/src/verify.ts` has no diff on this branch.
- `apps/shell-e2e/src/demo-path.spec.ts`, in a browser on a manifest with real auth and `apiMode: 'mock'`:
  every remote reached, labels on every route including the failure screen and an unknown route at
  390px, no request with an `Authorization` header and none to `/api/`; `http` and an out-of-contract
  `apiMode` offer nothing, and an absent one offers it as mock; a valid manifest naming `supabase`
  still refuses to boot; a stored persona or demo flag never enters the demo. A refused or unanswered
  redirect leaves a working demo and no credential sent, and a stored session is kept through one. A
  real session in a second tab leaves a demo labelled and uncredentialed until its next load.

### Not demonstrated

- **None of this has run on production.** No deploy was part of this change, and the production manifest
  has not served the demo path.
- **The edge half uses a local JWKS.** `verify.spec.ts` proves the verifier's behaviour, not the
  configured production issuer or key set. Both are as ADR-0014 left them.
- **`worker.dev.ts` would accept a `mock.demo.admin` string.** It is the development bypass, it is not in
  the deployed artifact (`config-parity.spec.ts`), and the demo never produces such a token. A demo
  cannot run against it either, because that Worker serves `apiMode: 'http'`.

## References

- ADR-0006, ADR-0010, ADR-0011, ADR-0014
- The design critique of 2026-11-03, P0 "A production visitor can't get past the Overview"
