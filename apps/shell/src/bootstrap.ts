import { inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Route, Router, provideRouter } from '@angular/router';
import type { NativeFederationResult } from '@angular-architects/native-federation-v4';
import { AtlasAuth, provideAtlasAuth } from '@atlas/shared-auth';
import { AtlasManifest, isAtlasManifest } from '@atlas/shared-contracts';
import { App } from './app/app';
import { ATLAS_MANIFEST } from './app/manifest.token';
import { ModuleUnavailable } from './app/module-unavailable/module-unavailable';
import { Overview } from './app/overview/overview';

type RemoteLoader = NativeFederationResult['loadRemoteModule'];

function buildRoutes(manifest: AtlasManifest, loadRemoteModule: RemoteLoader): Route[] {
  const remoteRoutes = Object.entries(manifest.remotes).map(
    ([name, def]): Route => ({
      path: def.route,
      canActivate: [
        () => inject(AtlasAuth).hasRole(def.requiredRole) || inject(Router).parseUrl('/'),
      ],
      loadChildren: () =>
        loadRemoteModule(name, def.exposedModule)
          .then((m) => (m as { remoteRoutes: Route[] }).remoteRoutes)
          // a down remote degrades to a friendly screen; the shell keeps working
          .catch((err) => {
            console.error(`Failed to load remote "${name}"`, err);
            return [{ path: '', component: ModuleUnavailable }];
          }),
    })
  );

  return [
    { path: '', pathMatch: 'full', component: Overview },
    ...remoteRoutes,
    { path: '**', component: ModuleUnavailable },
  ];
}

export function bootstrap(rawManifest: unknown, loadRemoteModule: RemoteLoader) {
  if (!isAtlasManifest(rawManifest)) {
    throw new Error('federation.manifest.json does not match the expected contract');
  }
  const manifest: AtlasManifest = rawManifest;
  return bootstrapApplication(App, {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(buildRoutes(manifest, loadRemoteModule)),
      provideAtlasAuth(),
      { provide: ATLAS_MANIFEST, useValue: manifest },
    ],
  });
}
