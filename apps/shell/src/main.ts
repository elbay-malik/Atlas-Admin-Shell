import { initFederation } from '@angular-architects/native-federation-v4';
import { manifestUrl, resolveRemoteUrls } from './manifest-url';

// IMPORTANT: nothing here may import a shared/mapped module (e.g. @atlas/*).
// Shared specifiers only resolve after initFederation installs the import map,
// which is why all application code loads via the dynamic import below.
// './manifest-url' is a plain relative import, bundled into this entry point.

const EMPTY_MANIFEST = { version: 1, remotes: {} };

async function fetchManifest(url: string): Promise<unknown> {
  // no-cache revalidates rather than bypassing the cache: the manifest is the
  // one file that must be re-read on every boot, or repointing a remote would
  // not take effect until a hard reload. The hashed chunks around it stay
  // immutable (ADR-0010).
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

(async () => {
  const url = manifestUrl();

  // A missing or malformed manifest must not take the whole console down: the
  // shell still boots with zero remotes, so the chrome, auth and overview work
  // and every domain simply reads as unavailable (ADR-0007).
  let manifest: unknown = EMPTY_MANIFEST;
  try {
    manifest = await fetchManifest(url);
  } catch (err) {
    console.error(`Could not load ${url} — starting with no remotes`, err);
  }

  // Relative entries become absolute against the manifest's own URL; absolute
  // entries pass through unchanged (ADR-0010).
  const remotes = resolveRemoteUrls(manifest, url);

  // SSE keeps the shell hot-reloading when a remote rebuilds — dev only.
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);

  // Keep the WHOLE result: initRemoteEntry() and adapters.remoteInfoRepo are
  // what make an in-page retry possible (ADR-0007).
  const federation = await initFederation(remotes, { sse: dev });

  const { bootstrap } = await import('./bootstrap');
  // Environment configuration lives in the manifest (ADR-0010), so which
  // backend the domains use is a deployment decision, not a build one. It is
  // read inside bootstrap, from the manifest that passed the contract guard —
  // reading it here would mean trusting a field on an object we have not
  // validated yet.
  await bootstrap(manifest, federation);
})().catch((err) => console.error(err));
