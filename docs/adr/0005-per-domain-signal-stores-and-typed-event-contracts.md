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

## References

- https://ngrx.io/guide/signals
- NgRx 21 announcement (dev.to/ngrx)
