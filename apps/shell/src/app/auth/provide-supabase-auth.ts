import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { GO_TRUE } from './gotrue.port';
import { SupabaseAtlasAuth } from './supabase-atlas-auth';

export interface SupabaseAuthConfig {
  url: string;
  /** The browser-safe publishable key, never the service-role secret. */
  publishableKey: string;
  /** OIDC provider used by the sign-in button. */
  provider?: string;
}

/**
 * Installs the real provider. Only the shell composition root calls this;
 * remotes inject AtlasAuth and receive the instance across the federation
 * boundary exactly as they do with the mock.
 *
 * The client is imported dynamically so @supabase/auth-js stays out of the
 * shell's initial bundle when no Supabase configuration is present.
 */
export function provideSupabaseAtlasAuth(config: SupabaseAuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: GO_TRUE,
      useFactory: async () => {
        const { GoTrueClient } = await import('@supabase/auth-js');
        return new GoTrueClient({
          url: `${config.url.replace(/\/$/, '')}/auth/v1`,
          headers: { apikey: config.publishableKey },
          // 'pkce', because the default 'implicit' flow puts tokens in the URL
          // fragment. detectSessionInUrl completes the redirect and strips the
          // code via replaceState, so no dedicated callback route is needed.
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
          // Hands initialization timing to AtlasAuth.init(), so the app
          // initializer can gate the first render on a restored session.
          skipAutoInitialize: true,
          storageKey: 'atlas.auth',
        });
      },
    },
    { provide: AtlasAuth, useClass: SupabaseAtlasAuth },
    provideAppInitializer(() => inject(AtlasAuth).init()),
  ]);
}
