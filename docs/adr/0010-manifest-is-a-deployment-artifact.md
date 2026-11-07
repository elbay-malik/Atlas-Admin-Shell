# ADR-0010: The federation manifest is a deployment artifact, not a build input

- Status: accepted
- Date: 2026-09-05
- Deciders: Elbay Malik

## Context and Problem Statement

ADR-0004 promises that "enabling a remote in an environment is a manifest edit" and that "per
environment, only the manifest differs". Until now that was untested: exactly one manifest existed,
committed at `apps/shell/public/federation.manifest.json` and hard-coded to `http://localhost:4201-4203`.
Slice 3 needs real environments, which forces the question the promise was always resting on —
**where does the environment live?**

The tempting answer is the Angular builder's own environment machinery. It is the wrong one, and
the reason matters enough to record.

## Decision Drivers

- Build once, promote everywhere. The artifact tested in CI should be the artifact that reaches
  production.
- Repointing a remote — a rollback, a new deployment domain, disabling a domain in one environment —
  must not require rebuilding or redeploying the shell.
- The extended manifest fields (`displayName`, `route`, `icon`, `requiredRole`) are product
  decisions. They should be reviewable in a pull request, not buried in pipeline templating.

## Considered Options

1. **Per-environment manifests committed as deploy inputs, copied over the built artifact at deploy
   time (chosen).**
2. Select a manifest at build time with the builder's `assets` output mapping or `fileReplacements`.
3. Generate the manifest in CI from a template plus environment variables.
4. Fetch the manifest from a config service or KV at runtime.

## Decision Outcome

Option 1. `deploy/manifests/<environment>/federation.manifest.json` holds one committed manifest per
environment, deliberately **outside every Nx target's inputs**. `tools/apply-manifest.mjs` copies the
chosen one over `dist/apps/shell/browser/` after the build and before upload. The shell's own
`public/` copy keeps its localhost URLs and remains the dev and e2e default, so local work and the
Playwright suite are untouched.

Two supporting changes make one build serve every environment:

- `resolveRemoteUrls` absolutises each entry against the manifest's own URL, so a manifest may use
  either `"/iam/remoteEntry.json"` (same-origin, path-routed — what every PR preview uses, with no
  per-PR edit) or `"https://iam.atlas.example/remoteEntry.json"` (multi-origin production). The
  federation runtime does no such resolution itself: it hands the string straight to `fetch` and
  derives the import-map scope with plain string math, so a relative entry would otherwise resolve
  against whatever the document base happened to be.
- The manifest is fetched with `cache: 'no-cache'` and served with a matching `Cache-Control`, so
  repointing a remote takes effect on the next load rather than after a hard refresh. The hashed
  chunks around it stay immutable for a year.

**Why not option 2**, the obvious one: it works mechanically and is still wrong. The builder's
`assets` are a plain glob-and-copy, so a per-configuration `assets` entry does land the right file —
but Nx merges configurations with a shallow assign, so the configuration's array *replaces* the base
one and you silently lose the rest of `public/`. `fileReplacements` does accept `.json`, but it is an
esbuild bundle-graph hook: it can only swap a JSON module you `import` from TypeScript, which bakes
the manifest into a content-hashed bundle — precisely what ADR-0004 forbids. Both variants make the
environment an input to `nx build shell`, giving it its own cache entry and its own artifact, so
repointing a remote means a rebuild and a redeploy of the shell. That is a direct contradiction of
the promise this ADR exists to keep.

Option 3 keeps the no-rebuild property but turns the manifest into an un-reviewable pipeline output,
losing PR review of the product fields and the ability to reproduce an environment locally. Option 4
is the strongest end state and is deferred: it puts a second blocking hop and a new availability
dependency in front of the whole console, and a config outage would render the platform empty, since
ADR-0007's degrade path is "zero remotes". `fetchManifest` is kept as the single seam so adopting it
later is a one-function change.

### Consequences

- Positive: one shell bundle is promoted unchanged through every environment. Repointing a remote is
  re-uploading one small file — no build, no cache invalidation, no shell redeploy. Environments are
  diffable in review.
- Negative: the shell's deploy target is no longer a plain upload — it owns the manifest swap. That
  is deliberate, and a self-review found out why it has to be. With the copy as a *separate*
  pipeline step, `nx run shell:deploy` re-ran its `build` dependency and restored the committed
  localhost manifest between the copy and the upload, so the deploy stayed green while shipping a
  console whose three remotes all pointed at `http://localhost`. Reproduced end to end before the
  fix. The copy now runs inside the deploy target, after the last thing that can rewrite `dist`, and
  `apply-manifest` reads the file back afterwards so a future re-introduction fails loudly instead of
  shipping.

## Correction, 2026-10-22: the read-back cannot catch what this ADR credits it with

The paragraph above ends: *"`apply-manifest` reads the file back afterwards so a future
re-introduction fails loudly instead of shipping."* It does read the file back. It cannot do that
job.

The failure being guarded is a rebuild clobbering the manifest **between the copy and the upload**.
The read-back runs microseconds after the copy and compares the target to the source — it cannot
observe an event that has not happened yet. What it genuinely catches is a copy that did not land
intact: a truncated write, a full disk, a target that is not writable the way we assumed. Worth
keeping, but a different and much smaller guarantee.

The thing that actually prevents the original failure is **structural**, and this ADR already
describes it one sentence earlier: the copy happens inside the deploy target, after
`dependsOn: ["build"]` has run, so nothing rebuilds between it and `wrangler deploy`. The protection
is the ordering, not the assertion.

Keeping the two straight is the point. A check credited with a guarantee it cannot provide is how
the real guarantee stops being maintained — someone reorders the pipeline, trusts the read-back to
notice, and it does not.

### The same review found a live bug in the script

`apply-manifest.mjs` had **no test of any kind**, and CI never executed it either: `deploy -c check`
overrides the command list, so the `check` configuration runs wrangler alone and never reaches this
script. The one step that decides which environment ships was unexercised by every gate.

Writing tests for it immediately surfaced an argument-parsing defect. The environment was
*"the first argument that does not start with `--`"*, which swallows the value belonging to `--out`:

```
apply-manifest --out dist production   ->  deployed an environment named "dist"
```

Argument **order** silently decided what shipped. Now fixed, with cases pinning both orders and a
`--out` with no directory after it. Verified by restoring the original parser and watching exactly
those cases fail.

The tests live in `libs/shared/contracts` because `tools/` is not an Nx project and has no test
target; `sharedGlobals` (ADR-0009) makes them run whenever the script changes.

## Verification

Checked 2026-09-05 against the installed tooling:

- `@angular/build` 21.2.18 resolves `assets` as a pure glob-to-copy with no transformation, and Nx
  merges target configurations with a shallow assign, so a configuration-level `assets` array
  replaces rather than extends the base one.
- The application builder's `fileReplacements` schema accepts `.json`, and the compiler plugin
  registers a JSON `onLoad` handler for it — confirming it operates on the bundle graph, not on
  copied assets.
- `@softarc/native-federation-orchestrator` 4.4.1 performs no URL resolution on manifest entries: the
  string is passed directly to `fetch`, and the import-map scope is derived by string manipulation.
  Relative entries are supported by the adapter, which already relies on one for the host itself
  (`hostRemoteEntry: { url: './remoteEntry.json' }`).
- Empirically disproved a suspected bug before acting on it: it was proposed that a two-segment deep
  link would resolve `fetch('federation.manifest.json')` against the route and request
  `/unavailable/federation.manifest.json`. A probe against the production build at
  `/unavailable/audit-logs` showed the request going to `/federation.manifest.json` and all three nav
  items rendering — Angular's emitted `<base href="/">` governs the resolution. `manifestUrl()` now
  states the rule explicitly anyway, because `resolveRemoteUrls` needs the base regardless, but it is
  documented as explicitness rather than a fix.
- `wrangler` 4.129.0 validates all four configs with `deploy --dry-run` and no credentials, reading
  42 assets for the shell and 48 for a remote.
- The committed environment manifest passes `tools/check-manifests.mjs`, and the validator was itself
  tested against an origin-only URL and an invalid role, failing each with a specific message.
  (This line originally said "both committed environment manifests". There has only ever been one,
  `production` — see "Why there is no preview environment yet" in `deploy/manifests/README.md`.)
- The validator duplicates `isAtlasManifest` rather than importing it, because it must run before and
  without a TypeScript build. That duplication was checked case by case, and it is safe in one
  direction only: the validator is strictly **stricter** than the runtime guard, so a manifest that
  passes CI always satisfies the shell. It additionally rejects a URL that does not point at an entry
  file, because the runtime derives a remote's import-map scope from the entry URL's *directory* — an
  origin-only or bare-directory URL would scope the whole host and collide with every other remote on
  it. It deliberately does **not** require the filename `remoteEntry.json`: that is Native
  Federation's default, but the name is configurable and a valid deployment may use another.

## Correction, 2026-09-06: "checked case by case" was not a mechanism, and it failed

The claim above — that the validator is strictly stricter than the runtime guard — was true when it
was written and **false within one slice**. The receipt said the duplication "was checked case by
case", which is a description of an act, not of a property that holds afterwards.

`apiMode` was added to `AtlasManifest` with the edge BFF (ADR-0011). It went into `isAtlasManifest`,
which rejects anything other than `'mock'` or `'http'`. It was never added to the validator. So from
that slice onward:

```
$ node tools/check-manifests.mjs        # manifest carrying apiMode: "htp"
✔ production: 3 remotes
exit: 0
```

and the shell then rejected the same file wholesale and booted with **zero remotes** — the precise
outcome the validator exists to prevent, walked straight past the gate that was supposed to catch it.
Reproduced before fixing, by adding a probe environment with a single typo'd character.

Two things were wrong, and both are fixed:

- **The rule was missing.** The validator now checks `apiMode`.
- **Nothing would have noticed.** The invariant is now a test rather than a comment.
  `libs/shared/contracts/src/lib/manifest-validator-parity.spec.mjs` imports the real `problems()`
  and the real `isAtlasManifest`, generates 80-odd mutations of a valid manifest by deleting and
  corrupting each field in turn, and asserts the implication *guard rejects ⟹ validator rejects* for
  every one. It is written as an implication, not an equality, so the validator stays free to be
  stricter — which it still is, and which the suite also asserts with an origin-only URL. Verified by
  deleting the new rule and watching the parity cases, and only those, fail.

That is the actual repair: the original defect was not a missing branch, it was relying on a person
to remember a duplicate.

### Second correction, 2026-09-23: that last paragraph used to overclaim

This section originally ended by asserting that "because the mutations are generated from a valid
manifest rather than enumerated, the next field added to the contract is covered the moment it
appears in the fixture." **That was not true when it was written.** The generator enumerated
`version`, `remotes` and `apiMode` by name and iterated a hardcoded `REMOTE_FIELDS` array, so a new
contract field was covered only when someone remembered to add it — the exact dependence on human
memory this correction claims to have removed, reintroduced one paragraph below the claim.

Found by an adversarial audit of the whole repository, which is the only reason it did not sit there
indefinitely being cited as a receipt.

It is true now, and in two layers rather than one:

- The mutation generator derives its field lists from the fixture (`Object.keys(base)` and
  `Object.keys(base.remotes.iam)`), so adding a field to the fixture covers it everywhere.
- A new test asks the guard **what it actually reads** — a recording `Proxy` over a valid manifest,
  valid so `isAtlasManifest` runs to completion rather than short-circuiting — and fails if the
  fixture has fallen behind it. That is what closes the loop: deriving from the fixture only helps
  if the fixture keeps up, and now forgetting the fixture is itself a failing test.

Verified in two stages by simulating the next field, `theme`:

| Stage | What was changed | Result |
| --- | --- | --- |
| A | added to `AtlasManifest` + `isAtlasManifest` only | `has a fixture covering every field the runtime guard inspects` fails: *add these to `base`: theme* |
| B | also added to the fixture, still not to the validator | 6 mutation cases fail — the `apiMode` rot, caught |

Then restored: 117 tests green. The lesson is narrow and worth keeping: *"generated rather than
enumerated"* is a property to test for, not a property you get by describing your code that way.

A related hole was closed on the shell side. `main.ts` read `apiMode` off the **raw** fetched
manifest and passed it to `bootstrap`, which independently validated and could discard that same
manifest — so a rejected manifest could still choose the data source, giving a console with zero
remotes *and* an out-of-contract API mode. `bootstrap` now derives it from the validated manifest and
the parameter is gone, which makes the combination unrepresentable rather than merely unlikely.

Finally, `deploy/manifests/production/` now states `"apiMode": "mock"` explicitly. The value is
unchanged — absent already meant mock — but the edge BFF is deployed on the shell's own origin, so a
reader was entitled to assume production talks to it. It does not, and cannot, until an identity
provider exists (ADR-0006). Writing it down turns a default into a decision.

Since 2026-11-07 the edge BFF is left out of the shell's deploy while this value is `mock`: the
shell's Worker is configured to serve assets only, which production takes at the next shell
deploy, and `manifest:check` refuses `http` until the BFF keys are back in `apps/shell/wrangler.jsonc`
(ADR-0011, Update 2026-11-07).

## References

- https://developers.cloudflare.com/workers/static-assets/
- ADR-0004 (manifest-driven dynamic host), ADR-0007 (degrade to zero remotes)
