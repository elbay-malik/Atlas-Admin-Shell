# ADR-0013: Run the gates locally while the repository is private

- Status: accepted
- Date: 2026-10-22
- Deciders: Elbay Malik

## Context and Problem Statement

GitHub-hosted Actions minutes are metered on **private** repositories — 2,000 per month on the Free
plan — and unmetered on public ones. This repository is private and exhausted its allowance on
2026-10-22. Every workflow run from 10:41 that day failed before executing a step, including the
`Deploy` workflow.

That turns a question about billing into a question about this project's thesis. The gates are not
incidental to the repository; they *are* the deliverable. An artifact that argues for verifiable
engineering and then cannot verify itself has lost the argument, whatever its README says.

## Decision Drivers

- The gates must keep running on every change. Nothing in this repo is worth less than that.
- No new spend.
- Whatever replaces hosted CI must be honest about what it does and does not guarantee — a gate that
  only *looks* like it runs is the failure mode this repository has already produced four times.

## Considered Options

1. **Pay for Actions minutes.** Rejected: the owner is unwilling, and the cost is recurring for a
   portfolio artifact.
2. **Make the repository public.** Actions becomes free and unlimited, and a portfolio flagship is
   meant to be read. The history was audited for this and is clean: `.env` was never tracked, no
   Cloudflare token appears in any commit, and the only key committed is the Supabase *publishable*
   key, which ships in the browser bundle by design. **Deferred, not rejected** — the owner is not
   ready to publish today. It remains the best answer and should be revisited.
3. **Weaken the gates to fit the budget.** Rejected outright. Dropping e2e or Lighthouse to save
   minutes would delete exactly the coverage that unit tests structurally cannot provide — the
   cross-origin federation path, axe on rendered output, the cost of runtime composition.
4. **A self-hosted runner.** Workable, and genuinely free. Rejected for now as a second always-on
   thing to operate and secure for a single-maintainer repository; it buys automation this project
   can currently get by running one command.
5. **Run the pipeline locally (chosen).** `tools/ci-local.mjs` executes every gate the workflow did,
   and the workflows are disabled rather than left to fail noisily.

## Decision Outcome

`pnpm run ci:local` runs all fourteen gates; `ci:local:quick` skips the four browser-driven ones.
The `CI` and `Deploy` workflows are `disabled_manually`, which is one command to reverse when either
the monthly allowance resets or option 2 is taken.

**Two deliberate differences from `.github/workflows/ci.yml`:**

- It runs **`run-many`, not `affected`**. CI used `affected` to stay inside a time budget. Locally
  the only cost is wall-clock, and running everything removes a whole class of failure this
  repository has already produced three times — a gate that was never *scheduled* rather than one
  that failed (ADR-0008 for the design tokens, ADR-0009 for `tools/`).
- It **continues after a failure** and reports every gate at the end. The useful answer before a
  merge is "which of these are broken", not "the first one".

**Deploys also move here.** With the `Deploy` workflow disabled, publishing runs from a developer
machine with the same credentials. The pre-flight from ADR-0010 still applies, because it lives in
the deploy target rather than in the workflow.

### Consequences

- Positive: every gate still runs, unweakened, at no cost. The local runner is also *stricter* than
  the workflow was, because it does not rely on `affected` to decide what matters.
- Negative, and the honest centre of this decision: **a local gate only runs when somebody runs
  it.** Hosted CI's real value was never the compute, it was that nobody could forget. This trades
  an automatic guarantee for a manual discipline, and manual discipline is exactly what every other
  decision in this repository refuses to rely on. There is no technical mitigation here, only the
  admission: a tired merge on a Friday will not be stopped by anything.
- Negative: pull requests no longer carry a visible green check, so a reviewer must take the author's
  word that the pipeline ran. The output is pasted into the PR for that reason, which is evidence of
  a weaker kind than a check GitHub ran itself.
- Negative: the matrix is gone. Hosted CI ran on `ubuntu-latest` with a pinned Node from `.nvmrc`;
  local runs happen on macOS with whatever `fnm` resolved. A platform-specific break would now reach
  `main` unseen. This repository has already hit one such bug — `wait-on tcp:` behaving differently
  than documented (ADR-0012) — so the risk is not hypothetical.

## Verification

Checked 2026-10-22:

- Actions billing: every run from 10:41 on 2026-10-22 failed before executing a step, across both
  the `CI` and `Deploy` workflows, on `main` and on branches alike.
- `gh workflow list --all` reports `CI  disabled_manually` and `Deploy  disabled_manually`. The
  `Copilot` reviewer is deliberately left active; it is not an Actions workflow of ours and has been
  producing useful review comments.
- History audited before considering option 2: `.env` is absent from every commit; no
  `CLOUDFLARE_API_TOKEN` value appears in any revision; every `sb_secret_`/`service_role` match in
  the tree is a test fixture or the detection rule in `tools/check-manifests.mjs`.
- Full local run against `fix/apply-manifest-readback`, the open pull request at the time:
  **14 of 14 gates passed.** Timings are listed in the PR; most are fast because Nx caches, and the
  browser-driven gates dominate the wall-clock.

## References

- https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- ADR-0009 (what the e2e gate exists to cover), ADR-0012 (the Lighthouse gate and its budget)
