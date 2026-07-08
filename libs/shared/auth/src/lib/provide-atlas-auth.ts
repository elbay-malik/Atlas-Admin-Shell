import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { AtlasAuth } from './atlas-auth';
import { MockAtlasAuth } from './mock-atlas-auth';

/**
 * Installs an auth provider against the AtlasAuth token and restores the
 * session before the app renders. Only the HOST calls this — remotes just
 * inject AtlasAuth and receive the shell's singleton via federation sharing.
 */
export function provideAtlasAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AtlasAuth, useClass: MockAtlasAuth },
    provideAppInitializer(() => inject(AtlasAuth).init()),
  ]);
}
