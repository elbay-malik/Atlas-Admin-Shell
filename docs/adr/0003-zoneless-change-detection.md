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
- Negative: tooling that assumes zone.js needs care. Known case: `@storybook/angular@10.4.6`
  declares a `zone.js >=0.14.0` **peer dependency**, and pnpm 11's default
  `autoInstallPeers: true` would **silently install it**. When the Storybook slice lands, add to
  `pnpm-workspace.yaml`:

  ```yaml
  peerDependencyRules:
    ignoreMissing:
      - zone.js
  ```

## Verification

Checked 2026-07-08:

- Zoneless default for new projects since Angular v21 (blog.angular.dev v21 announcement);
  stable since v20.2.
- `@storybook/angular@10.4.6` peerDependencies include `zone.js >=0.14.0` (`npm view`).
- pnpm 11 defaults: `strictPeerDependencies: false`, `autoInstallPeers: true` (pnpm.io/settings).

## References

- https://angular.dev/guide/zoneless
