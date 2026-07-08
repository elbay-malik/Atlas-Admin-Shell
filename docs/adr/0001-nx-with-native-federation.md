# ADR-0001: Use an Nx integrated monorepo with Native Federation, despite no official Nx support for it

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

The platform is a shell plus three independently deployable Angular remotes. Two ecosystem facts
are in tension:

- **Nx** provides the enterprise-scale monorepo signals this project exists to demonstrate:
  project graph, `affected` builds, computation caching, and tag-enforced module boundaries. But
  Nx's first-party federation tooling is webpack/rspack **Module Federation** via
  `@module-federation/enhanced` — a legacy-builder path for Angular.
- **Native Federation** (`@angular-architects/*`) is the modern, esbuild-native federation
  approach built on web standards (ES modules + import maps) and aligned with Angular's
  Application Builder — but its first-class home is the plain Angular CLI workspace. Nx has no
  generator for it.

## Decision Drivers

- Demonstrate esbuild-era architecture, not webpack lock-in.
- Keep Nx's graph/affected/boundaries — they are the point of the exercise.
- Manageable, documentable integration risk.

## Considered Options

1. **Nx + Native Federation (chosen)** — community-supported combination; init schematic run via
   `nx g`, manual `project.json`/tsconfig wiring owned by us.
2. Nx + webpack/rspack Module Federation — best DX (official generators), but legacy webpack
   builder for Angular; undercuts the modern-toolchain story.
3. Plain Angular CLI multi-project workspace + Native Federation — the officially supported NF
   home, but loses the project graph, affected builds, caching, and enforced boundaries.
4. Modular monolith (no federation) — simplest, but eliminates the architecture under study.

## Decision Outcome

Option 1. The integration friction is real, bounded, and itself a deliverable: this ADR and the
wiring it documents are evidence of evaluating tooling maturity, not following a generator.

Escape hatch (pre-committed): if Nx wiring stalls, run the NF init in a throwaway Angular CLI
workspace and port the generated wiring into the Nx apps; worst case, fall back to option 3.

### Consequences

- Positive: single toolchain for graph/caching/boundaries AND standards-based runtime federation.
- Negative: we own the integration and its upgrade path; schematic output must be treated as a
  draft and verified per app; no official support channel for the combination.

## Verification

Checked 2026-07-08:

- Nx federation docs cover only Module Federation via `@module-federation/enhanced`
  (nx.dev "Module Federation and Nx"); `@nx/module-federation` is a dependency of
  `@nx/angular@23.0.1`.
- Native Federation generator request: nrwl/nx discussion **#21829** — open since Feb 2024, no
  maintainer commitment; maintainers point at bundler-independent Module Federation 2.0 instead.
- `ng g` for the NF init schematic fails inside Nx workspaces; `nx g` is the working invocation
  (nrwl/nx issue **#21127**, closed with that guidance).
- `@angular-architects/native-federation-v4` 21.2.6 declares schematics (`collection.json`) and
  builders (`builders.json`) — confirmed via `npm view`.

## References

- https://github.com/nrwl/nx/discussions/21829
- https://github.com/nrwl/nx/issues/21127
- https://native-federation.com
