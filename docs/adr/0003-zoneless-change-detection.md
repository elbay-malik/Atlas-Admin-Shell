# ADR-0003: Zoneless change detection everywhere; zone.js never enters the dependency tree

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

zone.js is effectively a page-global singleton. In a federated page, a single zone-dependent
remote either drags zone.js back into everyone's runtime or behaves unpredictably next to
zoneless apps. Mixed zone/zoneless federation is the worst of both worlds.

## Decision Outcome

Every app — shell and all remotes — runs zoneless (Angular 21 default for new projects;
`provideZonelessChangeDetection()`), signals-first, OnPush-style components. zone.js must never
appear in `node_modules` as a resolved dependency of this workspace, and CI-era checks grep for
it after dependency changes.

### Consequences

- Positive: uniform change-detection semantics across the federation boundary; smaller bundles;
  no NG0908/multi-zone hazards.
- Negative: tooling that assumes zone.js needs care. The case we expected to bite —
  `@storybook/angular`, which declares a `zone.js >=0.14.0` peer — turned out to be safe, but only
  for reasons worth writing down; see the correction in Verification below. A CI guard
  (`test ! -d node_modules/zone.js`) keeps the claim honest rather than trusting it.

## Verification

Checked 2026-07-08:

- Zoneless default for new projects since Angular v21 (blog.angular.dev v21 announcement);
  stable since v20.2.
- `@storybook/angular@10.4.6` peerDependencies include `zone.js >=0.14.0` (`npm view`).
- pnpm 11 defaults: `strictPeerDependencies: false`, `autoInstallPeers: true` (pnpm.io/settings).

**Correction, checked 2026-09-05 when Storybook actually landed (ADR-0008).** The 2026-07-08 note
above concluded that pnpm would *silently install* zone.js and that
`peerDependencyRules.ignoreMissing` was therefore required. Both halves were wrong:

- `@storybook/angular` marks `zone.js` **optional** in `peerDependenciesMeta` — true in 10.6.0 and
  in the 10.4.6 that the original note cited. pnpm's `autoInstallPeers` installs only missing
  *non-optional* peers, so it was never going to be pulled in. (`ignoreMissing` only silences
  warnings; it does not prevent installation, so it would not have been the right lever anyway.)
- `@angular/core` itself lists zone.js as an optional peer, which is why it is absent today.
- Independently, `@storybook/angular` defaults `experimentalZoneless` to true for Angular >= 21
  (`experimentalZoneless = !!(VERSION.major && Number(VERSION.major) >= 21)`) and only pushes a
  `zone.js` polyfill when that flag is false — so the framework does not want it at runtime either.

Confirmed empirically: after installing the full Storybook 10.6.0 set,
`ls node_modules/.pnpm | grep -c zone.js` returns 0. The real peer hazards were different packages
entirely — `@angular/platform-browser-dynamic` and `@angular-devkit/architect`, both non-optional
peers absent from the workspace, which pnpm would have resolved to the Angular 22 line; they are
pinned in ADR-0008.

## References

- https://angular.dev/guide/zoneless
