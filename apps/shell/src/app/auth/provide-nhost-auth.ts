import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { ATLAS_IDENTITY } from './identity.port';
import { NhostIdentityClient } from './nhost-identity.client';
import { TokenAtlasAuth } from './token-atlas-auth';

export interface NhostAuthConfig {
  /** Auth base URL including the version segment, from the manifest. */
  url: string;
  /** OIDC provider used by the sign-in button. */
  provider?: string;
}

/**
 * Installs the real provider. Only the shell composition root calls this;
 * remotes inject AtlasAuth and receive the instance across the federation
 * boundary exactly as they do with the mock.
 *
 * There is no dynamic import here, and nothing to code-split: the client is a
 * few hundred lines of fetch calls in this repo rather than a vendor SDK, so
 * the lazy boundary the previous provider needed has no cost left to avoid.
 */
export function provideNhostAtlasAuth(config: NhostAuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ATLAS_IDENTITY,
      useFactory: () => new NhostIdentityClient({ url: config.url }),
    },
    { provide: AtlasAuth, useClass: TokenAtlasAuth },
    provideAppInitializer(() => inject(AtlasAuth).init()),
  ]);
}
