# shared-contracts

Cross-MFE contracts shared by the shell and every remote: the federation **manifest** shape
(`AtlasManifest`, `isAtlasManifest`) and the versioned **event** envelopes (`AtlasEvent`,
`isAtlasEvent`, typed creators). The lib is Angular-free (`type:util`) so it can be consumed by
the event bus, the remotes and the contract tests alike.

## Building

Run `nx build shared-contracts` to build the library.

## Running unit tests

Run `nx test shared-contracts` to execute the unit tests via [Vitest](https://vitest.dev/).

## Contract-test discipline (events)

`src/lib/events.ts` is append-only:

- `ATLAS_EVENT_VERSIONS` lists every `(type, version)` ever published. A payload shape is frozen
  the moment it is listed; to evolve it, add a new version (and a new payload guard) — never edit
  the old one. Consumers filter by type and ignore versions they do not understand, so a newer
  remote can never crash an older shell.
- `src/lib/events.fixtures.ts` holds one canonical fixture per `(type, version)`, keyed
  `'<type>.v<n>'`, with a fixed `id`/`occurredAt`.
- `src/lib/events.spec.ts` enforces the pairing: every registry entry needs a fixture, every fixture
  must pass `isAtlasEvent`, mutated fixtures (dropped field, wrong version, unknown type, wrong
  payload field type) must be rejected, and the typed creators must reproduce the fixtures.
- A **catalogue snapshot** (`{ type, version, envelopeKeys, payloadKeys }` per fixture) lives in
  `src/lib/__snapshots__/events.spec.ts.snap` and is committed. Vitest refuses to write new
  snapshots in CI, so any change to the published key set fails CI until someone updates the
  snapshot deliberately (`pnpm exec nx test shared-contracts -- -u`) together with the version
  bump that justifies it.
