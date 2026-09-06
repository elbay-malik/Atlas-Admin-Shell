# Atlas Admin Shell

[![CI](https://github.com/EleoXDA/Atlas-Admin-Shell/actions/workflows/ci.yml/badge.svg)](https://github.com/EleoXDA/Atlas-Admin-Shell/actions/workflows/ci.yml)
![Angular](https://img.shields.io/badge/Angular-21%20LTS-dd0031)
![Nx](https://img.shields.io/badge/Nx-23-143055)
![pnpm](https://img.shields.io/badge/pnpm-11-f69220)
![License](https://img.shields.io/badge/license-MIT-blue)

An enterprise-grade **microfrontend control plane**: a zoneless Angular shell that composes three
independently deployable domain remotes — **IAM**, **Feature Flags**, and **Audit Logs** — at runtime
via [Native Federation](https://native-federation.com) and a manifest-driven remote registry.

## What is Atlas Admin Shell

A production-shaped admin platform demonstrating how a large organization runs many domain teams
against one shell: each remote is built, tested, and deployed on its own, and the shell discovers it
at runtime from `federation.manifest.json` — adding a domain to the platform is a manifest edit, not
a shell rebuild.

## Why this exists

This is a portfolio flagship whose deliverable is **architecture, not features**: runtime federation
on web standards (ES modules + import maps), zoneless signals-first Angular, strict domain
boundaries enforced by the build system, typed cross-microfrontend contracts, and every significant
decision recorded as an ADR with dated, verifiable receipts.

## Architecture

<!-- TODO: Mermaid diagram — shell / remotes / manifest / event bus / auth context flow -->

| App | Role | Port (dev) | Route |
| --- | --- | --- | --- |
| `shell` | Dynamic host: chrome, auth, remote orchestration, error boundaries | 4200 | `/` |
| `iam` | Users, roles, access management | 4201 | `/iam` |
| `feature-flags` | Flag dashboard with toggles | 4202 | `/flags` |
| `audit-logs` | Searchable event log | 4203 | `/audit` |

## Key decisions

Every decision is an ADR in [`docs/adr/`](docs/adr/), each with a **Verification** section holding
dated receipts (npm peer ranges, GitHub issue states) for its claims.

| ADR | Decision |
| --- | --- |
| [0001](docs/adr/0001-nx-with-native-federation.md) | Nx monorepo + Native Federation, despite no official Nx support for it |
| [0002](docs/adr/0002-angular-21-lts-over-angular-22.md) | Angular 21 LTS over GA Angular 22 |
| [0003](docs/adr/0003-zoneless-change-detection.md) | Zoneless change detection everywhere; zone.js never enters the dependency tree |
| [0004](docs/adr/0004-manifest-driven-dynamic-host.md) | Remotes resolved at runtime from a manifest, not build-time imports |
| [0005](docs/adr/0005-per-domain-signal-stores-and-typed-event-contracts.md) | Per-domain Signal Stores + typed, versioned cross-MFE event contracts |
| [0006](docs/adr/0006-mock-first-auth-behind-interface.md) | Mock-first auth behind a DI interface; OIDC (Supabase) as a drop-in later |
| [0007](docs/adr/0007-remote-error-boundaries.md) | Remote error boundaries: reject rather than cache a fallback; recover by re-initialising the remote |
| [0008](docs/adr/0008-storybook-webpack-framework-with-a11y-gate.md) | Storybook on the webpack Angular framework, with accessibility as a CI gate |
| [0009](docs/adr/0009-federation-e2e-on-production-builds-in-ci.md) | Federation e2e against production builds served statically in CI |
| [0010](docs/adr/0010-manifest-is-a-deployment-artifact.md) | The federation manifest is a deployment artifact, not a build input |
| [0011](docs/adr/0011-edge-bff-as-the-authorization-boundary.md) | The edge BFF is the authorization boundary; the client only hides things |

## Quickstart

```bash
# Node 24.18 (fnm picks up .nvmrc automatically) and pnpm via corepack
corepack enable   # if corepack is missing: npm i -g corepack

git clone git@github.com:EleoXDA/Atlas-Admin-Shell.git
cd Atlas-Admin-Shell
pnpm install

# Start everything (shell + all remotes)
pnpm exec nx run-many -t serve -p shell,iam,feature-flags,audit-logs --parallel=4
# ...or just the shell
pnpm exec nx serve shell
```

## Repository structure

```
apps/
  shell/           # dynamic host
  shell-bff/       # edge BFF: the /api/* Worker on the shell's origin
  iam/             # remote: identity & access
  feature-flags/   # remote: flag dashboard
  audit-logs/      # remote: event log
libs/
  shared/
    ui/            # design-system components (buildable)
    design-tokens/ # Style Dictionary → CSS vars + Tailwind @theme
    contracts/     # cross-MFE types: manifest, versioned events (buildable)
    auth/          # AtlasAuth interface + providers (buildable)
    event-bus/     # AtlasEventBus singleton with replay (buildable)
    util/          # shared store features (withRequestStatus)
docs/
  adr/             # architecture decision records (MADR)
```

## Quality gates

| Gate | What it runs | Where |
| --- | --- | --- |
| Unit + contract tests | Every project, incl. a frozen event-catalogue snapshot | `nx affected -t test` |
| Accessibility (components) | axe on every Storybook story, light **and** dark, `a11y.test: 'error'` | `nx affected -t test-storybook` |
| Accessibility (application) | axe over the real federated console, every remote, both themes | `nx affected -t e2e` |
| Control affordances | WCAG 1.4.11 boundary contrast, which axe does **not** automate | `nx affected -t e2e` |
| Federation e2e | Playwright specs against production builds over real import maps | `nx affected -t e2e` |
| Auth boundary | no remote may bundle the identity client (ADR-0006) | `pnpm run bundles:check` |
| Edge authorization | token verification and role rules in real workerd (ADR-0011) | `nx test shell-bff` |
| Edge API over HTTP | the real Worker via `wrangler dev`, no credentials needed | `nx e2e shell-bff-e2e` |
| Deploy artifacts | every environment manifest satisfies the contract | `pnpm run manifest:check` |
| Boundaries | `@nx/enforce-module-boundaries` tag rules | `nx affected -t lint` |
| Zoneless | fails if `zone.js` ever resolves into the tree (ADR-0003) | CI guard step |

## Deploying

Each app publishes as a Cloudflare Worker serving static assets (`apps/<app>/wrangler.jsonc`). The
shell sets `not_found_handling: "single-page-application"` because it owns routes; the remotes
deliberately do not, so a missing chunk 404s and the shell's error boundary can classify it rather
than receiving HTML with a 200.

The environment lives in the **manifest**, never in the build (ADR-0010):

```bash
pnpm run manifest:check                       # validate every environment manifest
ATLAS_ENV=production pnpm exec nx run shell:deploy   # needs Cloudflare credentials
```

The deploy target builds, swaps in that environment's registry, and uploads — in
that order, as one step. Applying the manifest separately would not work: the target
depends on `build`, so a rebuild between the two silently restores the committed
localhost registry, and the deploy would still look green while shipping a console
whose remotes all point at localhost. `apply-manifest` reads the file back after
copying so that failure cannot pass unnoticed.

`nx affected -t deploy -c check` type-checks every wrangler config against its asset directory and
needs no account, so CI proves the deploy config on every pull request. Actual publishing is
skipped until `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repository secrets —
the deploy workflow reports that it skipped rather than failing.

Repointing a remote is editing one file in `deploy/manifests/<env>/` and re-uploading it. No
rebuild, no shell redeploy.

## Engineering practices

- **Conventional commits**; trunk-based development — direct commits for the foundation slice,
  short-lived PRs (squash-merged) from slice 2 onward.
- **Affected-based CI**: `nx affected` via `nrwl/nx-set-shas`, so only changed projects build.
- **Module boundaries as law**: `@nx/enforce-module-boundaries` with `scope:`/`type:` tags —
  domains cannot import each other's internals; only `scope:shared` crosses boundaries.
- **Single-version policy**: all `@angular/*` pinned via pnpm overrides so every federation
  participant shares byte-identical framework versions.
- CODEOWNERS/branch protection intentionally omitted (solo repository) — noted as a decision.

## Roadmap

- [x] **Slice 1 — Foundation → Federation**: Nx workspace, boundaries, token pipeline, zoneless
  shell, Native Federation with 3 remotes loading from the manifest, mock auth, CI.
- [x] **Slice 2 — Domains + State**: NgRx Signal Stores per remote, typed event bus + contract
  tests, error boundaries with retry/fallback, Storybook + a11y, federation E2E suite in CI.
- [ ] **Slice 3 — BFF + Deploys**: Cloudflare Workers (static assets) per app, `nx affected`
  deploy pipelines, PR previews, edge BFF, Supabase OIDC swap-in.
  - [x] Per-environment manifests as deploy artifacts, wrangler config per app, deploy targets and
    a credential-gated deploy workflow. Validated end to end with `wrangler --dry-run`; **publishing
    is blocked until Cloudflare credentials exist** (see Deploying).
  - [x] Supabase OIDC provider behind the existing `AtlasAuth` interface, unit-tested against a fake
    client. The mock remains the default; **a real sign-in needs a Supabase project**. ADR-0006
    carries an honest amendment on where the "drop-in" claim did and did not hold.
  - [x] Edge BFF on the shell's Worker (`/api/*`), verifying tokens and enforcing authorization
    server-side — including invariants the client cannot, such as refusing to demote the last admin.
    Closed a real hole: a viewer could toggle a feature flag (ADR-0011).
  - [x] Remotes call the BFF over HTTP behind a contract, selected by the manifest's `apiMode`;
    the mock stays the default so the console runs with no backend.
  - [ ] PR previews (needs Cloudflare credentials).
- [ ] **Slice 4 — Polish**: Lighthouse CI + Core Web Vitals, axe pass, whitepaper completion,
  demo video, Angular 22 migration (once Nx & NgRx support lands) as a showcase PR.

Nx Cloud (remote caching) is deliberately not connected yet; opting in later is
`pnpm exec nx connect` on the free Hobby plan.

## License

[MIT](LICENSE)
