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
 * True only for a request to OUR OWN origin under /api/.
 *
 * Both halves are load-bearing, and the origin half was missing until
 * 2026-09-23: the guard resolved the URL and then tested only its pathname, so
 * `https://anywhere.example/api/x` satisfied it and was handed a bearer token.
 * Checking the path alone answers "does this look like an API call", which is
 * not the question — the question is whether this credential is going to the
 * party it was minted for.
 *
 * Fails closed on an unparseable URL: if we cannot prove the target is ours,
 * it does not get the token.
 *
 * The BFF is same-origin by construction (ADR-0011). If it ever moves off this
 * origin, the fix is an explicit allowlist here, never dropping the check.
 */
function isSameOriginApiCall(url: string): boolean {
  let target: URL;
  try {
    target = new URL(url, location.origin);
  } catch {
    return false;
  }
  return target.origin === location.origin && target.pathname.startsWith(API_PREFIX);
}

/**
 * Attaches the caller's bearer token to API calls, and ONLY to API calls.
 *
 * The URL guard is load-bearing rather than tidiness: without it the token
 * would ride along on cross-origin `remoteEntry.json` and chunk requests, i.e.
 * this platform would hand every remote's CDN a credential it has no business
 * seeing.
 */
export const atlasAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isSameOriginApiCall(request.url)) return next(request);

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
