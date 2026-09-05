# ADR-0005: Per-domain NgRx Signal Stores + typed, versioned cross-MFE event contracts

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

Microfrontends exist to decouple domains. A single global store shared across remotes would
re-create exactly the coupling federation removes — but the domains still need to communicate
(auth context, "flag changed", "tenant switched").

## Decision Outcome

- **State**: each remote owns its `@ngrx/signals` stores (`signalStore`, `withEntities`,
  `rxMethod`). No store crosses a federation boundary. Shell-level state (theme, user, manifest)
  lives in the shell and shared libs only.
- **Communication**: cross-MFE events are typed, versioned contracts in `@atlas/shared-contracts`
  (every payload carries `type` + `version`), flowing over a shared event-bus abstraction —
  remotes never import each other. Contract tests (slice 2) fail CI on breaking payload changes.
- **Auth**: context propagates via the shared singleton `AtlasAuth` service (ADR-0006), never via
  events.

### Consequences

- Positive: compile-time safety across boundaries with preserved independent deployability;
  stores stay domain-scoped and testable.
- Negative: contract evolution requires versioning discipline; the bus is one more shared
  singleton to share correctly in federation config.

## Verification

Checked 2026-07-08: `@ngrx/signals@21.1.1` is latest (peer `@angular/core ^21.0.0`); the
`@ngrx/signals/events` plugin was **stabilized in NgRx 21** (v21 announcement), including scoped
events (local/parent/global) called out as useful for microfrontends; the experimental-era
`withEffects` was renamed `withEventHandlers` in v21 — pre-v21 tutorials are outdated.

Re-checked 2026-09-05, when the transport was implemented:

- `@ngrx/signals` **22.0.0** is now `latest` (peer `@angular/core ^22.0.0`), so 21.1.1 stays
  pinned until the Angular 22 migration of ADR-0002. `@ngrx/operators@21.1.1` was added for
  `tapResponse` (peer `rxjs` only, no Angular peer — it does not constrain the migration).
- The `@ngrx/signals/events` export list in the installed 21.1.1 is `Dispatcher, Events,
  ReducerEvents, event, eventGroup, injectDispatch, mapToScope, on, provideDispatcher, toScope,
  withEventHandlers, withReducer` — there is no `withEffects` symbol (only stale doc comments),
  and scopes are `'self' | 'parent' | 'global'`
  (`node_modules/@ngrx/signals/types/ngrx-signals-events.d.ts:34-37, 359-360`).
- **Why the cross-MFE bus is not the events `Dispatcher`**: `Events`, `ReducerEvents` and
  `Dispatcher` are `providedIn: 'platform'` over a plain rxjs `Subject` with no replay
  (`node_modules/@ngrx/signals/fesm2022/ngrx-signals-events.mjs:24, 69, 87, 149, 153`). A remote
  loaded *after* an event was published would miss it — exactly the audit-logs case. A dispatcher
  singleton would also pin the cross-boundary contract to NgRx's module identity and exact version
  (`shareAll` uses `strictVersion: true`, `requiredVersion: 'auto'`). `@atlas/shared-event-bus`
  therefore owns the transport with a bounded replay buffer, and the events plugin stays available
  for intra-store use.

### Sharing `@ngrx/signals` across the boundary needs `includeSecondaries`

Found by the federation e2e suite on 2026-09-05, after the stores worked perfectly in unit tests:
every remote failed at runtime with `TypeError: Cannot set properties of undefined (setting
'entityMap')`.

The cause is that `@ngrx/signals` is consumed through **several entry points** — the root plus
`/entities` and `/rxjs-interop`. With Native Federation's default `ignoreUnusedDeps`, the shell (the
host, which only uses `signalStore` for its remote-health store) shared just the **root** entry,
while each remote additionally shared the secondaries. Host-wins resolution then mapped
`@ngrx/signals` to the shell's copy, but a remote's `@ngrx/signals/entities` bundle had been built
against its *own private* copy of the core — verified in the served bundle, which imports
`signalStoreFeature, withComputed, withState` from `@nf-internal/chunk-…` rather than from the bare
specifier. Two module instances means two different `STATE_SOURCE` symbols, so `withState` inside
`withEntities` wrote into a `store[STATE_SOURCE]` that did not exist.

The cure is the one this workspace already applies to `@angular/core`: mark the package
`includeSecondaries: { keepAll: true }` in **every** `federation.config.mjs`, which opts the whole
package out of unused-dependency pruning so host and remotes resolve one consistent set. Confirmed
after the change: `iam-home` renders through the shell with zero console errors, and the full
federation suite passes in both dev and production-static modes.

The lesson generalises — *any* shared library consumed through secondary entry points needs the
same treatment, because unit tests resolve one copy from `node_modules` and cannot catch this class
of bug. Only the federation e2e suite can.

## References

- https://ngrx.io/guide/signals
- NgRx 21 announcement (dev.to/ngrx)
