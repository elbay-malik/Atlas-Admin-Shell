# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: technical evaluators.** Hiring managers, staff and principal engineers,
and architects assessing the author's work. They arrive sceptical, give the thing
minutes rather than hours, and are looking for evidence of judgement — not feature
count. The simulated platform admin is a vehicle for that assessment, not the
audience to optimise for.

**In-fiction user (the role the UI is written for):** a platform administrator at a
large organisation who manages identity and access, operates feature rollouts, and
reviews an audit trail across domains owned by different teams. Two roles exist and
only two: `admin` and `viewer`, where an admin satisfies every requirement and a
viewer satisfies only `viewer`.

Because the primary audience is technical, legibility of the architecture ranks
alongside usability: an evaluator should be able to see the runtime composition
happening, not merely be told about it.

## Product Purpose

Atlas Admin Shell is an enterprise-shaped **microfrontend control plane**: a zoneless
Angular shell that composes three independently deployable domain remotes — IAM,
Feature Flags, Audit Logs — at runtime via Native Federation and a manifest-driven
remote registry.

Its stated deliverable is **architecture, not features**. Success is an evaluator
concluding, without being walked through it, that the person who built this makes
sound engineering decisions and documents them honestly.

## Positioning

The claim a neighbouring project could not truthfully copy: **adding a domain to the
platform is a manifest edit, not a shell rebuild.** Remotes are resolved at runtime
from `federation.manifest.json` (ADR-0004), which is a deployment artifact rather
than a build input (ADR-0010) — so repointing or adding a remote ships without
rebuilding or redeploying the shell.

Supporting, equally verifiable positions:

- Runtime federation on **web standards** — ES modules and import maps, not a
  bundler-proprietary runtime.
- **Zoneless** throughout, with `zone.js` gated out of the dependency tree entirely
  (ADR-0003) rather than merely unused.
- Every significant decision recorded as an ADR with **dated, verifiable receipts**,
  including the ones that aged badly.
- The honesty itself is part of the position: ADRs record negatives and expired
  receipts rather than only wins.

## Operating Context

Evaluators encounter Atlas in three confirmed ways, all unguided:

1. **The live URL, cold.** They open the deployed console with no explanation. The
   first viewport and the signed-out state carry the most weight of any surface.
2. **The GitHub repository first.** README, the ADR set, and commit history are read
   before anything renders; the app then confirms or contradicts them. This makes
   the docs a primary surface, not supporting material.
3. **A portfolio case-study page** that frames the project before they click through.

Not a confirmed path: the author narrating a live walkthrough. Nothing may depend on
narration to make sense.

Operational truths of using it:

- The console is one page composed at runtime from four independently deployed
  origins. A remote can be unavailable while the rest of the console works; the
  shell rejects and never caches a fallback, and recovers by re-initialising the
  remote (ADR-0007).
- Every manifest committed in the repo defaults to `apiMode: 'mock'` (ADR-0010), so
  a fresh checkout runs every domain with zero server calls.
- The manifest is fetched **before** authentication and publishes every remote with
  its `requiredRole`. Remote existence is public by design; it is not a secret the
  UI can keep.
- Authorization lives at the edge BFF. The client only hides things (ADR-0011) —
  no client-side gate may be presented as a security boundary.
- Theme is a first-class runtime state: light and dark, persisted to
  `localStorage` under `atlas.theme`, falling back to `prefers-color-scheme`.

## Capabilities and Constraints

Confirmed functionality:

- **Shell** — chrome, navigation built from the manifest, authentication, theme,
  remote error boundaries, an `unavailable` route reserved to the shell.
- **IAM** (`/iam`, requires `admin`) — users, roles, access management.
- **Feature Flags** (`/flags`, requires `viewer`) — flag dashboard with toggles.
- **Audit Logs** (`/audit`, requires `viewer`) — searchable event log.
- Cross-remote communication is typed and versioned over a shared event bus with
  bounded replay (ADR-0005); auth context propagates by DI as a federation
  singleton, never by events.
- Authentication is either the documented mock personas or Supabase OIDC with
  GitHub as the provider, chosen by the manifest's `auth` block.

Durable technical constraints future design work must respect:

- **Angular 21 LTS, zoneless, signals-first.** No `zone.js`, no `NgModule`-era
  patterns, no change-detection assumptions that need a zone.
- **Strict domain boundaries** enforced by the build system. A remote may not
  import another remote; shared code lives in `libs/shared/*`.
- **Design tokens are generated, not hand-written.**
  `libs/shared/design-tokens/tokens/color.json` and `dimension.json` are the single
  source; the committed CSS is built from them and a `tokens:check` gate fails on
  drift. Editing the CSS directly is a gate failure, not a shortcut.
- **Shared components live in `libs/shared/ui`** — currently `button`, `badge`,
  `nav-item`, `theme`, `theme-toggle`. Anything a second surface needs belongs
  there rather than duplicated into a remote.
- **No remote may bundle the identity client** (ADR-0006), enforced by
  `bundles:check`.
- Performance is budgeted for the architecture actually chosen — runtime federation
  means more requests than a monolith, and the budget says so (ADR-0012).

Explicitly undecided / not yet true:

- The repository is private and CI minutes are exhausted, so the gates run locally
  via `pnpm run ci:local` (ADR-0013). There is no green check on a pull request.
- Going public has not been decided.
- `apiMode` is `'mock'` in production today; authentication is real, flag data is
  not.

## Brand Commitments

- The name **Atlas Admin Shell**, and the domain names IAM / Feature Flags /
  Audit Logs, are fixed. Routes `/iam`, `/flags`, `/audit` are published in the
  manifest and the README.
- **Voice, as established across README and ADRs:** precise, technical, and
  unusually candid — it names what a decision costs and what a check cannot do.
  Claims carry receipts. Marketing register would read as a regression here, and
  with technical evaluators as the primary audience it would actively cost
  credibility.
- MIT licensed.
- No external brand, client, or visual identity constrains this project.

## Evidence on Hand

Real and verifiable:

- Four deployed Workers on `*.eleo-666.workers.dev`; the console composes live from
  real cross-origin remote entries.
- Thirteen ADRs in `docs/adr/`, MADR-style, several carrying dated verification
  receipts — and some recording expired ones.
- A 14-gate local pipeline (`tools/ci-local.mjs`): zoneless guard, manifest
  contract, token drift, lint, typecheck, unit and contract suites, four builds,
  Storybook build, wrangler dry-runs, bundle check, axe over Storybook, federation
  e2e against production builds, edge-BFF e2e over real HTTP, Lighthouse.
- Storybook as a component workbench, with axe as a gate (ADR-0008).
- Real Supabase GoTrue project serving an ES256 JWKS, GitHub OAuth enabled.

Must not be fabricated — these do not exist:

- Users, customers, traffic, adoption numbers, uptime history, or testimonials.
- Any enterprise actually running Atlas. It is a portfolio artifact shaped like a
  production system, and must never claim to be a deployed product.
- Pricing, licensing tiers, SLAs, or compliance certifications.

**One known inaccuracy, not yet fixed:** the README states axe runs on every story
in light *and* dark. Most stories currently render in a single theme only. Future
work either makes the claim true or corrects it; it must not be cited as evidence
in the meantime.

## Product Principles

1. **Architecture must be visible, not just claimed.** The primary audience is
   technical and unguided. Where a choice can either demonstrate the runtime
   composition or hide it, prefer showing it — the manifest-driven nav, a remote
   failing in isolation, the theme crossing the federation boundary.
2. **Never dress a convenience as a guarantee.** The client hides; the edge
   authorizes. A redirect, a hidden nav item, or a disabled control is UX, and may
   never be presented or justified as a security boundary.
3. **Honesty outranks polish.** A documented negative is an asset here. Stating what
   a check does not cover is the behaviour the audience is assessing; a claim
   without a receipt is worse than no claim.
4. **It must survive a cold open.** No surface may depend on narration, a README, or
   prior context to make sense — the deployed console is judged in minutes by someone
   who was told nothing.
5. **Shared before local.** Tokens and `libs/shared/ui` are the single source for
   anything two surfaces show. Drift between remotes is the failure mode this
   architecture is most exposed to, and it is a design failure before it is a
   technical one.

## Accessibility & Inclusion

**Binding standard: WCAG 2.2 AA.** This is what an enterprise control plane would be
procured against, and it is treated as a product requirement rather than an
aspiration.

- Automated axe coverage is a CI gate, over Storybook stories and over the real
  federated console (ADR-0008).
- The criteria axe cannot automate are explicitly in scope and must be checked by
  hand or by targeted e2e assertion. **axe-core has no rule that measures a focus
  indicator at all**, which is why the axe suites passed for months with no focus
  style anywhere in the workspace — a gate's silence is not coverage.
- Already asserted by targeted e2e: 1.4.11 non-text contrast for control boundaries
  (`control-contrast.spec.ts`), and 2.4.7 focus visible — the shared ring, walked
  over the real tab order in both themes, including the error boundary, asserting
  authored style and width as well as contrast, because the user agent's own ring
  would pass a colour-only check (`focus-visible.spec.ts`).
- Binding and still **not** asserted anywhere: 2.4.11 focus not obscured, and 2.5.8
  target size (minimum).
- Both themes are in scope for every criterion. A component that passes in light and
  fails in dark fails.
- Zoneless and signals-first does not exempt anything: live-region announcements for
  async state must be deliberate, since there is no zone-driven re-render to lean on.
