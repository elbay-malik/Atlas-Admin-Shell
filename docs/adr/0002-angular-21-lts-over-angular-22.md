# ADR-0002: Pin Angular 21 LTS rather than GA Angular 22

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

Angular 22 reached GA on 2026-06-03 (22.0.5 current at decision time). A greenfield flagship
should normally start on the newest major — unless the surrounding ecosystem cannot follow yet.

## Decision Drivers

- All four legs of the stack (Angular, Nx, Native Federation, NgRx) must resolve **within their
  declared peer ranges** — an enterprise repo does not start life on `--legacy-peer-deps`.
- Angular 21 is in LTS; nothing needed from 22 is blocking (zoneless is default since v21,
  signals APIs are stable).

## Considered Options

1. **Angular 21.2.x LTS (chosen).**
2. Angular 22.0.x now — requires prerelease Nx (`23.1.0-rc.0`) and running NgRx outside its peer
   range.

## Decision Outcome

Angular 21.2.17 (`v21-lts`), with the upgrade to 22 planned as a *single coordinated
`nx migrate`* once Nx ships stable Angular 22 support AND NgRx 22 is released — switching from
`@angular-architects/native-federation-v4` to the base-named `@angular-architects/native-federation@22.x`
in the same change. The migration itself becomes a showcase PR.

### Consequences

- Positive: every dependency resolves cleanly; LTS patch stream; deterministic federation
  version-sharing (single Angular version everywhere).
- Negative: forgo Angular 22 niceties (stable Signal Forms, Angular Aria GA, TS 6) for now; a
  known migration is queued.

## Verification

Checked 2026-07-08 via `npm view` (live registry):

- `@angular/core` dist-tags: `latest=22.0.5`, `v21-lts=21.2.17`; 22.0.0 published 2026-06-03.
- `@nx/angular@23.0.1` (latest) peerDependencies: `@angular/build >= 19.0.0 < 22.0.0` (same range
  for devkit/schematics/ng-packagr) — **Angular 22 excluded**; only `23.1.0-rc.0` (next) widens
  to `< 23.0.0`.
- `@ngrx/signals` dist-tags: `latest=21.1.1` with peer `@angular/core ^21.0.0`; **no 22.x exists,
  not even on `next`** (which is a stale `21.0.0-rc.0`).
- `@angular-architects/native-federation-v4@21.2.6` requires `@angular/build ^21.2.0` — the v4
  adapter line for Angular 20/21. The base-named package at 21.x is the older v3 line
  (`@softarc/native-federation ~3.5.1`); base-named 22.x is the v4 line for Angular 22.
- `@storybook/angular@10.4.6` peers `@angular/core >=18 <22` — also excludes 22.

Revisit triggers: Nx stable release with Angular 22 peers + NgRx 22 on `latest`.

## References

- https://native-federation.com/docs/v3-vs-v4.html
- https://github.com/ngrx/platform/issues/5158
