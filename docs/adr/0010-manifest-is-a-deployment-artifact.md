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
- Both committed environment manifests pass `tools/check-manifests.mjs`, and the validator was itself
  tested against an origin-only URL and an invalid role, failing each with a specific message.
- The validator duplicates `isAtlasManifest` rather than importing it, because it must run before and
  without a TypeScript build. That duplication was checked case by case, and it is safe in one
  direction only: the validator is strictly **stricter** than the runtime guard, so a manifest that
  passes CI always satisfies the shell. It additionally rejects a URL that does not point at an entry
  file, because the runtime derives a remote's import-map scope from the entry URL's *directory* — an
  origin-only or bare-directory URL would scope the whole host and collide with every other remote on
  it. It deliberately does **not** require the filename `remoteEntry.json`: that is Native
  Federation's default, but the name is configurable and a valid deployment may use another.

## References

- https://developers.cloudflare.com/workers/static-assets/
- ADR-0004 (manifest-driven dynamic host), ADR-0007 (degrade to zero remotes)
