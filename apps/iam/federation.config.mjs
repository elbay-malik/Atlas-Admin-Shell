import { withNativeFederation, shareAll } from '@angular-architects/native-federation-v4/config';

export default withNativeFederation({
  name: 'iam',



  exposes: {
    './Routes': './apps/iam/src/app/remote.routes.ts',
  },


  sharedMappings: [
    '@atlas/shared-ui',
    '@atlas/shared-auth',
    '@atlas/shared-contracts',
    '@atlas/shared-event-bus',
    '@atlas/shared-util',
  ],

  shared: {
    ...shareAll(
      { singleton: true, strictVersion: true, requiredVersion: 'auto', build: 'package' },
      {
        overrides: {
          // includeSecondaries is an opt-out of ignoreUnusedDeps, so all of
          // @angular/core is shared to prevent mismatches.
          '@angular/core': { singleton: true, strictVersion: true, requiredVersion: 'auto', build: 'package', includeSecondaries: { keepAll: true } },
          // Same hazard, same cure. Without keepAll the host shares only the
          // @ngrx/signals ROOT entry, while a remote's '/entities' bundle is
          // built against its own private copy of the core — so signalStore and
          // withEntities end up with different STATE_SOURCE symbols and the
          // store blows up with "Cannot set properties of undefined".
          '@ngrx/signals': { singleton: true, strictVersion: true, requiredVersion: 'auto', build: 'package', includeSecondaries: { keepAll: true } },
        },
      },
    ),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    // Add further packages you don't need at runtime
  ],

  // Please read our FAQ about sharing libs:
  // https://shorturl.at/jmzH0

  features: {
    // ignoreUnusedDeps is enabled by default now
    // ignoreUnusedDeps: true,

    // Opt-in: groups chunks in remoteEntry.json for smaller metadata file
    denseChunking: true
  }
});
