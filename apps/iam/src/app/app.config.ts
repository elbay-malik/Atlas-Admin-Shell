import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAtlasAuth, provideAtlasHttp } from '@atlas/shared-auth';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { appRoutes } from './app.routes';

/**
 * The STANDALONE entry point only. Under the shell these come from the host as
 * federation singletons (ADR-0006), and remote.routes.ts stays provider-free so
 * the federated path keeps using the host's instances. Providing them here is
 * what makes `nx serve <remote>` on its own actually work.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideAtlasAuth(),
    provideAtlasHttp(),
    provideAtlasEventBus(),
  ],
};
