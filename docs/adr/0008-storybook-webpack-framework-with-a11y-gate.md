# ADR-0008: Storybook on the webpack `@storybook/angular` framework, with accessibility as a CI gate

- Status: accepted
- Date: 2026-09-05
- Deciders: Elbay Malik

## Context and Problem Statement

`@atlas/shared-ui` is the design system every app and remote renders through, but it had no
workbench and no accessibility check. A component library that four independently deployed
applications depend on needs both: a place to see every state without booting the federation, and a
gate that stops an inaccessible component reaching all four at once.

The awkward part is that this workspace is deliberately esbuild-era and **zoneless**
(ADR-0001, ADR-0003), while Storybook's stable Angular framework is still webpack-based and
historically wanted zone.js.

## Decision Drivers

- Must not drag zone.js into the dependency tree — that would break the premise of ADR-0003.
- Must not break the single-version policy on `@angular/*`.
- Accessibility should fail the build, not sit in a panel nobody opens.
- Prefer stable over new: this is the library four deployables share.

## Considered Options

1. **`@storybook/angular` 10.6.0 (webpack 5) with `@storybook/test-runner` as the a11y gate
   (chosen).**
2. `@storybook/angular-vite` 10.6.0 — Vite 8, zoneless by default, works with the Vitest addon.
   Matches the toolchain story far better, but is documented as *preview until Storybook 11* and is
   not in `@nx/storybook` 23.0.1's `uiFramework` enum.
3. `@storybook/addon-vitest` instead of the test-runner — rejected because it only supports
   Vite-based frameworks, which option 1 is not.
4. No Storybook; rely on unit tests — leaves the design system with no visual workbench and no axe
   coverage.

## Decision Outcome

Option 1, configured by hand rather than by the Nx generator (ADR-0001 already treats schematic
output as a draft; the generator also wants to add `ts-node` and a tsconfig input this workspace
does not need).

- `experimentalZoneless: true` is set explicitly on both targets. It already defaults to true for
  Angular ≥ 21, but stating it documents the intent and survives a future default change.
- Accessibility is gated with `parameters.a11y.test = 'error'` in `preview.ts`, enforced by
  `@storybook/test-runner` against the built static Storybook. Any axe violation fails the run.
- Tailwind and the design tokens are wired into the workbench (`.storybook/styles.css` plus a
  project-local `.postcssrc.json`), so stories render with the real tokens rather than unstyled.
- `argTypes` are written by hand: Compodoc is not installed (its 2.0.0 depends on the **Angular 22**
  devkit, which would violate the single-version policy), and Storybook's docgen does not read
  signal `input()` declarations anyway.
- Two non-optional peers of `@storybook/angular` were absent from the workspace and are pinned
  explicitly — `@angular/platform-browser-dynamic` 21.2.17 (also added to the pnpm overrides) and
  `@angular-devkit/architect` 0.2102.18 — because pnpm's `autoInstallPeers` would otherwise resolve
  them to the Angular 22 line.

**The gate immediately earned its place.** On its first run it failed three of thirteen story
tests: `UiBadge` rendered its status hue on that hue's own 15% tint, giving **3.65:1** where WCAG AA
requires 4.5:1 for text this size. The fix was in the design system rather than the test — new
`on-success` / `on-warning` / `on-danger` foreground tokens that resolve dark in light mode and
light in dark mode, so the badge keeps its tinted look and clears AA in both themes.

### Consequences

- Positive: every component has a workbench; axe runs on every story in CI; a contrast regression
  in the shared library now fails a build instead of shipping to four applications.

## Correction, 2026-09-23: the gate was blind to the tokens themselves

The Positive line above was true for a change to a *component*, and false for a change to the
*tokens those components read* — which is the more likely way a contrast regression actually
arrives, and precisely how the one recorded above got in.

`libs/shared/design-tokens` had **zero inbound edges in the Nx project graph**. Every app and the
Storybook preview consume it through a relative CSS `@import`, which Nx does not parse, so nothing
declared the dependency. The consequence was measured, not inferred:

```
$ nx show projects --affected --files=libs/shared/design-tokens/src/generated/tokens.css -t test-storybook
[]
$ ... -t e2e          -> []
$ ... -t lighthouse   -> []
$ ... -t build        -> []
```

So reverting `--atlas-color-border-strong` to the weak value — the exact 1.18:1 / 1.29:1 defect
`control-contrast.spec.ts` was written to catch — was a one-file pull request on which CI ran a
single eslint task. The gate this ADR is about could not see the one file class it most needed to.

Two things were wrong, and both are fixed:

- **The edge did not exist.** The four apps and `shared-ui` now declare
  `implicitDependencies: ["shared-design-tokens"]`, which is how a dependency Nx cannot infer is
  supposed to be stated. The same probes now return `["shared-ui"]` for `test-storybook`,
  `["shell-e2e","shell-bff-e2e"]` for `e2e`, `["shell"]` for `lighthouse`, and all five projects
  for `build`.
- **The pipeline had no receipt.** `src/generated/*.css` is committed and is what the apps actually
  import, while `tokens/*.json` is the declared source of truth — and nothing checked they agreed.
  Editing a colour in the source was a silent no-op. `build-tokens.mjs --check` now rebuilds into a
  temporary directory and compares, wired as `pnpm run tokens:check` in CI. Verified in both
  directions: editing `tokens/color.json` fails it, and hand-editing the generated CSS fails it too.

The root cause is worth naming, because it is the fourth instance of one pattern in this repository:
a gate that is green while measuring nothing. Here the gate was real and the *graph* was wrong, so
the gate was simply never scheduled. An assertion about coverage is only as good as the edge that
schedules it.
- Negative: webpack 5 enters `devDependencies` alongside the esbuild toolchain — acceptable for
  dev-only tooling that never touches an application bundle, but it is a wart on the
  "esbuild-era" story and is the main reason to revisit. The test-runner also brings Jest 30 and a
  second `playwright` package next to `@playwright/test`.
- Revisit trigger: **Storybook 11 GA**, when `@storybook/angular-vite` is expected to be stable and
  `@nx/storybook` accepts it. That swap would delete webpack from the tree and enable the Vitest
  addon.

## Verification

Checked 2026-09-05:

- `storybook`, `@storybook/angular`, `@storybook/addon-docs` and `@storybook/addon-a11y` are all
  `10.6.0` (published 2026-09-02); every addon peers `storybook ^10.6.0`, so the whole set is pinned
  together. `@storybook/test-runner` `0.24.5` peers `storybook ^10.6.0-0 || ^11.0.0-0`.
- `@storybook/angular@10.6.0` lists `zone.js >=0.14.0` as a peer but marks it **optional** in
  `peerDependenciesMeta` (so does 10.4.6), and pnpm's `autoInstallPeers` installs only
  *non-optional* peers — see the ADR-0003 correction. `ls node_modules/.pnpm | grep -c zone.js`
  returns 0 after installing the whole Storybook set.
- Both builders derive `experimentalZoneless` from the installed Angular version
  (`!!(VERSION.major && Number(VERSION.major) >= 21)`), and the webpack preset pushes a `zone.js`
  polyfill **only** when that flag is false — so a zoneless Angular 21 workspace never pulls it in.
- `@storybook/angular-vite@10.6.0` exists and is stable-tagged, but the Storybook docs state it "is
  currently in preview and is planned to be marked stable in Storybook 11"; `@nx/storybook@23.0.1`'s
  `configuration` generator does not accept it in `uiFramework`.
- The Vitest addon's docs state the plugin "can only be used with Storybook frameworks that use Vite
  (and Next.js)", while "the test runner … can be used with any Storybook framework".
- `@compodoc/compodoc@2.0.0` depends on `@angular-devkit/schematics 22.0.4`.
- `@angular/platform-browser-dynamic` latest is 22.1.5 and `@angular-devkit/architect` latest is
  0.2201.7 — both Angular 22 line, hence the explicit pins.

## References

- https://storybook.js.org/docs/get-started/frameworks/angular
- https://storybook.js.org/docs/writing-tests/accessibility-testing
- https://pnpm.io/settings/peer-dependencies
