# shared-event-bus

The cross-microfrontend event transport: a federation **singleton** (like `@atlas/shared-auth`) that
carries the versioned event contracts from `@atlas/shared-contracts`. Remotes publish into and
observe the same instance, so they communicate without ever importing each other (ADR-0005).

`ReplayAtlasEventBus` keeps a bounded history (200 events by default) and can replay it to a late
subscriber — the audit remote sees a flag toggle that happened before it was even loaded.

Only the **host** calls `provideAtlasEventBus()`; remotes just `inject(AtlasEventBus)`.

## Running unit tests

Run `nx test shared-event-bus` to execute the unit tests.
