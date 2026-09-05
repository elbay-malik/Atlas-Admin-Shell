/**
 * How the shell finds its remote registry and reads the URLs inside it.
 *
 * Split out of main.ts only so it can be unit-tested. Like main.ts it must stay
 * free of any `@atlas/*` import: shared specifiers only resolve after
 * `initFederation` installs the import map. A plain relative import is fine —
 * it is bundled into the entry point.
 */

/** The shape main.ts needs before `@atlas/shared-contracts` is loadable. */
export type RawManifest = { remotes?: Record<string, { url?: string }> };

/**
 * The manifest is deployed next to index.html, so it is resolved against the
 * document base URL. Angular's builder always emits `<base href>`, so a bare
 * relative fetch already resolves correctly even on a deep link; doing it
 * explicitly means the rule is stated in one place rather than depending on a
 * tag elsewhere, and it gives `resolveRemoteUrls` a base to work from.
 */
export function manifestUrl(baseUri: string = document.baseURI): string {
  return new URL('federation.manifest.json', baseUri).href;
}

/**
 * ADR-0010: the manifest is a DEPLOYMENT artifact, so one shell build has to
 * accept both shapes of remote URL —
 *
 *   "/iam/remoteEntry.json"                        same-origin, path-routed
 *   "https://iam.atlas.example/remoteEntry.json"   multi-origin
 *
 * — and repointing a remote must never be more than editing that file.
 *
 * The federation runtime will not resolve them for us: the orchestrator hands
 * the manifest string straight to `fetch()` and derives the remote's import-map
 * scope with plain string math, so a relative entry would resolve against
 * whatever the document base happens to be. Absolutising once, here, is what
 * makes both forms mean the same thing everywhere afterwards — the import map,
 * RemoteLoader's liveness probe, the health store and the e2e route globs all
 * then see one identical string.
 *
 * Absolute URLs pass through byte-identically, so the committed localhost
 * manifest, `nx serve` and the e2e suite are unaffected.
 */
export function resolveRemoteUrls(manifest: unknown, base: string): Record<string, string> {
  const remotes = (manifest as RawManifest | null)?.remotes;
  if (typeof remotes !== 'object' || remotes === null) return {};

  const resolved: Record<string, string> = {};
  for (const [name, def] of Object.entries(remotes)) {
    // Skip entries without a usable URL rather than coercing them:
    // String(undefined) would hand initFederation the literal "undefined".
    if (typeof def?.url !== 'string' || def.url.length === 0) continue;

    let url: string;
    try {
      url = new URL(def.url, base).href;
    } catch {
      console.error(`Ignoring remote "${name}": ${JSON.stringify(def.url)} is not a usable URL`);
      continue;
    }

    // Write it back so RemoteLoader's probe and initRemoteEntry use exactly the
    // string the import map was built from.
    def.url = url;
    resolved[name] = url;
  }
  return resolved;
}
