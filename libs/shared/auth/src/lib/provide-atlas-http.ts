import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AtlasAuth } from './atlas-auth';

/** Same-origin API prefix. The BFF runs on the shell's own origin (ADR-0011). */
const API_PREFIX = '/api/';

/**
 * Attaches the caller's bearer token to API calls, and ONLY to API calls.
 *
 * The URL guard is load-bearing rather than tidiness: without it the token
 * would ride along on cross-origin `remoteEntry.json` and chunk requests, i.e.
 * this platform would hand every remote's CDN a credential it has no business
 * seeing.
 */
export const atlasAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const url = request.url;
  const isApiCall = url.startsWith(API_PREFIX) || new URL(url, location.origin).pathname.startsWith(API_PREFIX);
  if (!isApiCall) return next(request);

  const auth = inject(AtlasAuth);
  return from(auth.getAccessToken()).pipe(
    switchMap((token) =>
      next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request)
    )
  );
};

/**
 * Installs HttpClient with the auth interceptor. Called by the HOST, and by each
 * remote's standalone entry point — exactly like provideAtlasAuth, and for the
 * same reason: under federation the remotes inherit the shell's root injector.
 *
 * `@angular/common/http` is already a shared federation singleton, so this adds
 * nothing to the shared set.
 */
export function provideAtlasHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withFetch(), withInterceptors([atlasAuthInterceptor])),
  ]);
}
