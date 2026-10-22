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

## Correction, 2026-10-22: the receipt expired, and the decision now rests on something else

**Both revisit triggers above have fired, and this ADR went on asserting otherwise for months.**
That is the failure worth recording: not that the migration is deferred — deferral is a legitimate
choice — but that the stated *cause* stopped being true and nobody re-checked, in a repository whose
first rule is that a claim without a receipt is an opinion. A receipt that has silently expired is
worse than no receipt, because it reads as evidence while asserting something false.

Re-checked 2026-10-22 via `npm view` (live registry):

| Leg | 2026-07-08 (as recorded above) | 2026-10-22 |
| --- | --- | --- |
| `@nx/angular` | `23.0.1`, peer `@angular/build >= 19.0.0 < 22.0.0` — **22 excluded** | `24.0.0`, peer `>= 20.0.0 < 23.0.0` — **22 included** |
| `@ngrx/signals` | `latest=21.1.1`, **no 22.x anywhere** | `latest=22.0.1`, peer `@angular/core ^22.0.0` |
| `@storybook/angular` | `10.4.6`, peer `>=18 <22` — **22 excluded** | `10.6.3`, peer `>=18 <23` — **22 included** |
| Native Federation | 22.x line existed but `latest` was parked on `21.2.6` | `@angular-architects/native-federation` `latest=22.2.3` |

The Native Federation line is the newest change and removes the last mechanical obstacle. In
September the 22.x releases existed but were not on `latest`, so adopting them meant pinning an
exact version outside any dist-tag. That is no longer true.

**The decision to stay on Angular 21 is unchanged. Its justification is not.**

It is no longer "the ecosystem cannot follow" — it can. What remains is narrower and weaker, and
should be stated as such:

- Angular 22 has **no `v22-lts` dist-tag** (`latest=22.2.3`, and the LTS tags stop at `v21-lts`).
  Moving now means leaving a frozen LTS patch stream for a moving `latest`, which cuts against this
  ADR's own stated driver.
- Nothing in v22 addresses a gap this codebase has. Assessed in detail: Signal Forms stabilising
  does not help an admin console of toggles and selects; the Resource APIs duplicate ground the
  NgRx Signal Store architecture already covers (ADR-0005) and would leave two competing
  data-fetching idioms; OnPush-by-default is a no-op where 10 of 14 components already set it
  explicitly; selectorless components are syntax.
- The migration has real, concentrated risk: `canMatch` gains a mandatory `currentSnapshot`
  parameter, and `canMatch` is the single mechanism ADR-0007's error-boundary design was built
  around and verified against router internals line by line. `paramsInheritanceStrategy` also flips
  to `'always'` with **no** automatic migration.

So the honest position is **deliberately deferred on cost/benefit**, not **blocked upstream**. The
revisit trigger changes accordingly: when Angular cuts a `v22-lts` tag, or when something in 22
actually solves a problem this repository has.

Worth noting separately: Nx itself is now `24.0.0` while this workspace pins `23.0.1`. That is
ordinary dependency drift rather than a blocker, but it is the kind of drift this ADR exists to
notice.

## References

- https://native-federation.com/docs/v3-vs-v4.html
- https://github.com/ngrx/platform/issues/5158
