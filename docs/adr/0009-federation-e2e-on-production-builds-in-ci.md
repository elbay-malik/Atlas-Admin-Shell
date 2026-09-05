# ADR-0009: Run the federation e2e suite against production builds served statically in CI

- Status: accepted
- Date: 2026-09-05
- Deciders: Elbay Malik

## Context and Problem Statement

The Playwright suite is the only thing that tests the actual claim of this platform: that a shell
composes three independently built applications at runtime, over real import maps, across origins.
Slice 1 wrote the specs but left them out of CI — and, as it turned out, they could not run through
Nx at all: `nx e2e shell-e2e` hung forever.

## Decision Drivers

- The suite must run unattended in CI, deterministically.
- What CI exercises should be as close as possible to what slice 3 will deploy.
- The repository deliberately has **no Nx Cloud** connection (README), so nothing may depend on it.

## Considered Options

1. **Production builds served statically (`serve-static`) in CI, dev servers locally (chosen).**
2. The four Native Federation dev servers in CI as well — matches local exactly, but boots four Vite
   servers per run and tests dev-mode output that is never deployed.
3. Atomized per-spec `e2e-ci` targets — the Nx-recommended shape for large suites.

## Decision Outcome

Option 1, with three separate defects fixed to make it possible.

**The hang.** Nx 23 only treats a `dependsOn` target as long-running when it declares
`"continuous": true`; anything else must *complete* before dependents are scheduled. The four
`serve` targets did not declare it, so `nx e2e` waited for four dev servers that never exit. They
now do.

**The target choice.** `e2e-ci` (the atomized, one-process-per-spec form the Playwright plugin
infers) **refuses to run without Nx Cloud** — `nx run shell-e2e:e2e-ci` exits with "The
shell-e2e:e2e-ci task should only be run with Nx Cloud." Since ADR-era policy is that Nx Cloud stays
unconnected for now, CI runs the plain `e2e` target: one Playwright process, `workers: 1` and
`retries: 2` from the Nx preset. Atomization becomes attractive if and when Nx Cloud is connected;
until then it is a target that cannot run.

**The environment.** `playwright.config.mts` picks its web servers from `process.env.CI`:
`serve-static` in CI, `serve` locally. `serve-static` runs the production Native Federation output
through `http-server` with `--cors` (needed for the shell on :4200 to fetch `remoteEntry.json` from
:4201-4203) and an SPA fallback (needed for the deep-link role-gating specs). The command strings
stay exactly `pnpm exec nx run <app>:<target>` because `@nx/playwright` parses them to derive
`dependsOn` — any extra flag breaks the regex and each spec would boot its own servers.

`apps/shell-e2e` also gained `implicitDependencies` on all four applications: the shell has no
project-graph edge to any remote (that is the whole point of a runtime manifest), so without it a
remote-only change would never mark the e2e suite affected.

### Consequences

- Positive: CI tests the artifacts slice 3 deploys, including hashed production chunks and real
  cross-origin `remoteEntry.json` fetches. Once the four builds are cached, `http-server` starts in
  about a second. Measured locally: 14 specs in 26.5s in CI mode, 13.7s against dev servers.
- Negative: a CI failure may need a production build to reproduce locally
  (`CI=true nx run shell-e2e:e2e`). Without Nx Cloud there is no per-spec parallelism, so the suite
  is one serial process — fine at 14 specs, a pressure point later.

## Verification

Checked 2026-09-05:

- `nx run shell-e2e:e2e-ci` exits with `The shell-e2e:e2e-ci task should only be run with Nx Cloud.`
  — hence the plain `e2e` target in the workflow.
- Nx schedules a dependency as long-running only when it declares `continuous`
  (`nx/src/tasks-runner/create-task-graph.js:153-158` sorts into `continuousDependencies` vs
  `dependencies`; `tasks-schedule.js:232-236` requires the former merely *running* and the latter
  *completed*).
- `@nx/web:file-server` defaults `cors: true`, which makes `http-server` send
  `Access-Control-Allow-Origin: *`, and `spa: true` copies `index.html` to `404.html` and proxies
  unmatched deep links to it.
- `@nx/playwright` derives `dependsOn` from each `webServer.command` only when `reuseExistingServer`
  is truthy and the command matches `^(?:(?:npx|yarn|bun|pnpm|pnpm exec|pnpx) )?nx run (\S+:\S+)$`.
- Action majors current at the time of writing: `actions/checkout` v7.0.1, `actions/setup-node`
  v7.0.0, `actions/upload-artifact` v7.0.1, `actions/cache` v6.1.0, `pnpm/action-setup` v6.1.0,
  `nrwl/nx-set-shas` v5.0.1. `@playwright/test` is pinned to exactly 1.61.1 so the browser cache key
  is stable.
- Both modes verified locally end to end: `nx e2e shell-e2e` → 14 passed (13.7s);
  `CI=true nx run shell-e2e:e2e` → 14 passed (26.5s), servers torn down cleanly.

## References

- https://nx.dev/ci/features/split-e2e-tasks
- https://playwright.dev/docs/test-webserver
