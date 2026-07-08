import { initFederation } from '@angular-architects/native-federation-v4';

// IMPORTANT: nothing here may import a shared/mapped module (e.g. @atlas/*).
// Shared specifiers only resolve after initFederation installs the import map,
// which is why all application code loads via the dynamic import below.
(async () => {
  const response = await fetch('federation.manifest.json');
  const manifest: unknown = await response.json();

  const remotes = Object.fromEntries(
    Object.entries(
      (manifest as { remotes?: Record<string, { url?: string }> }).remotes ?? {}
    ).map(([name, def]) => [name, String(def.url)])
  );

  // SSE keeps the shell hot-reloading when a remote rebuilds — dev only.
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  const { loadRemoteModule } = await initFederation(remotes, { sse: dev });

  const { bootstrap } = await import('./bootstrap');
  await bootstrap(manifest, loadRemoteModule);
})().catch((err) => console.error(err));
