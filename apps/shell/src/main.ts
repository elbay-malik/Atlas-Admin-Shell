import { initFederation } from '@angular-architects/native-federation-v4';

// IMPORTANT: nothing here may import a shared/mapped module (e.g. @atlas/*).
// Shared specifiers only resolve after initFederation installs the import map,
// which is why all application code loads via the dynamic import below.

/** The shape main.ts needs before @atlas/shared-contracts is loadable. */
type RawManifest = { remotes?: Record<string, { url?: string }> };

const EMPTY_MANIFEST = { version: 1, remotes: {} };

async function fetchManifest(): Promise<unknown> {
  const response = await fetch('federation.manifest.json');
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for federation.manifest.json`);
  }
  return response.json();
}

(async () => {
  // A missing or malformed manifest must not take the whole console down: the
  // shell still boots with zero remotes, so the chrome, auth and overview work
  // and every domain simply reads as unavailable (ADR-0007).
  let manifest: unknown = EMPTY_MANIFEST;
  try {
    manifest = await fetchManifest();
  } catch (err) {
    console.error('Could not load federation.manifest.json — starting with no remotes', err);
  }

  // Skip entries without a usable URL rather than coercing them: String(undefined)
  // would hand initFederation the literal "undefined" to fetch.
  const remotes = Object.fromEntries(
    Object.entries((manifest as RawManifest | null)?.remotes ?? {})
      .filter((entry): entry is [string, { url: string }] => typeof entry[1]?.url === 'string' && entry[1].url.length > 0)
      .map(([name, def]) => [name, def.url])
  );

  // SSE keeps the shell hot-reloading when a remote rebuilds — dev only.
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);

  // Keep the WHOLE result: initRemoteEntry() and adapters.remoteInfoRepo are
  // what make an in-page retry possible (ADR-0007).
  const federation = await initFederation(remotes, { sse: dev });

  const { bootstrap } = await import('./bootstrap');
  await bootstrap(manifest, federation);
})().catch((err) => console.error(err));
