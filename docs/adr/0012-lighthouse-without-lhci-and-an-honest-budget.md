# ADR-0012: Drive Lighthouse directly, and budget for the architecture we chose

- Status: accepted
- Date: 2026-09-06
- Deciders: Elbay Malik

## Context and Problem Statement

Slice 4 opens with "Lighthouse CI + Core Web Vitals". Two questions had to be answered before any
number could be trusted: **what runs it**, and **what is honest to assert** for a console that
composes three independently deployed remotes at runtime.

The second question is the harder one. Fetching a manifest, then three cross-origin `remoteEntry.json`
files, then a remote's own chunks before a domain screen paints is a real cost, chosen deliberately
in ADR-0004. A budget tight enough to look impressive would only be passable by abandoning runtime
federation, which would make the gate an argument against the architecture rather than a guard
against regressions.

## Decision Outcome

**Drive `lighthouse` directly rather than adopting `@lhci/cli`.**

`@lhci/cli` is the obvious choice and it was rejected on evidence. Its last release is 0.15.1 from
June 2025, over a year old; its last commit to `main` is a day later, while community pull requests
fixing its dependencies sit unmerged. It pins `lighthouse` 12.6.1 exactly and spawns that nested
copy, so installing a current Lighthouse alongside it changes nothing. Its dependency tree audits at
13 vulnerabilities, 7 of them high. Its own CI tests Node 18 only, while this workspace pins 24.18.

This repository already rejects stale tooling on exactly these grounds — Compodoc for depending on
the Angular 22 devkit (ADR-0008), `@storybook/angular-vite` for preview status. Adding a dormant
wrapper with high-severity advisories to a project whose thesis is verifiable, current tooling would
contradict that. Driving Lighthouse 13.4.1 directly costs about 150 lines and keeps the dependency
current and Node-compatible.

It also removes a trap. **LHCI aggregates with `optimistic` by default**, which for a numeric budget
takes the *minimum* across runs — so increasing `numberOfRuns` makes the gate *looser*, because one
lucky run satisfies it. The runner here takes the **median** by construction.

**What is asserted, and what deliberately is not.**

- **Errors** are limited to what is deterministic and ours: cumulative layout shift, and no console
  errors. These do not move with runner load.
- **Warnings** carry the timing metrics (FCP, LCP, TBT, Speed Index) and the category scores. They
  report rather than fail because Lighthouse varies run to run on a shared CI runner, and a gate that
  goes red for reasons nobody controls teaches people to ignore it. Promoting them is a decision to
  make once the numbers have a track record — not on day one.
- **INP is not asserted at all.** It is a field metric: in a navigation run the audit is absent from
  the report entirely (it declares `supportedModes: ['timespan']`) and carries zero weight in the
  performance score. A `minScore` assertion on it would pass silently forever; a numeric one would
  fail with "did not produce a value". Total Blocking Time is the lab proxy, and honest INP needs
  field data this project does not collect. The roadmap said "Core Web Vitals"; this is the part of
  that phrase a lab run cannot deliver, and saying so beats a gate that measures nothing.
- **Accessibility is not gated here.** axe already gates it twice — every Storybook story in both
  themes, and the whole console through the Playwright suite — across more pages and states than
  Lighthouse sees. A third, weaker check would add noise, not safety.

**Two routes are measured**, because one of them would have told us nothing on its own. `/` is the
shell alone: cheap, stable, the pure boot cost. `/flags` signed in is the number that actually
reflects ADR-0004, because reaching it forces the manifest, three cross-origin entry fetches and then
a remote's chunks before anything domain-shaped paints.

### Consequences

- Positive: the dependency is current and audits clean; the aggregation is median rather than
  optimistic; and the federated cost of the architecture is now a measured number rather than an
  assumption.
- Negative: about 150 lines of runner to maintain, against a wrapper that would have been
  configuration. That trade is only worth it because the wrapper is dormant; if it revives, this
  decision should be revisited.
- The CI figure is measured through `http-server`, which sends no compression and disables caching,
  while production serves gzipped and immutable through Cloudflare `_headers`. The timing numbers are
  therefore an **uncompressed-localhost floor**, not a production number. Byte-weight and
  cache-policy audits are deliberately not asserted, because asserting them would be asserting a
  property of the test server.

## Verification

Measured 2026-09-06, median of 3 desktop runs against the production build served by `serve-static`:

| Route | FCP | LCP | Speed Index | TBT | CLS | Performance |
| --- | --- | --- | --- | --- | --- | --- |
| `/` shell, signed out | 388ms | 1445ms | 388 | 0ms | 0.000 | 0.96 |
| `/flags` federated, signed in | 706ms | 1629ms | 706 | 0ms | 0.000 | 0.94 |

**The delta is the point.** Composing a remote at runtime costs roughly 318ms of FCP and 184ms of
LCP here. That is the price of ADR-0004, and it is now visible rather than asserted.

**The first implementation was wrong, and the numbers said so.** Both routes initially reported
almost identical timings (LCP 1446 vs 1444), which cannot be true if one of them loads a remote. The
report confirmed it: `/flags` had a `finalDisplayedUrl` of `/` and had fetched **zero** remote
chunks. Playwright's `browser.newPage()` opens an isolated context, so the persona seeded there never
reached Lighthouse's own navigation; the shell redirected the role-denied deep link to the overview
and scored an empty console. The runner now uses a persistent context so both share one storage
partition.

Because a green gate that measures the wrong page is worse than no gate — it reads as evidence —
the runner refuses to report at all unless the run landed on the URL it asked for, and unless a route
declared federated actually fetched remote chunks rather than only probing `remoteEntry.json`. Both
guards were verified by breaking the seed deliberately and confirming the failure message.

A second defect surfaced while wiring the Nx target: `wait-on tcp:127.0.0.1:<port>` never resolves in
wait-on 9 — it times out against a server that is demonstrably answering. The readiness checks now
use `http://` resources, which wait for a real 200 rather than a socket. The same wrong form was
already in the Storybook accessibility gate's target, so it was corrected there too and that gate
re-verified (18 story tests).

## References

- https://developer.chrome.com/docs/lighthouse/overview
- ADR-0004 (manifest-driven federation), ADR-0009 (production builds served statically in CI)
