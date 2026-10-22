import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ATLAS_API_MODE } from '@atlas/shared-util';
import { provideFlagsApi } from './api-mode';
import { FlagsApi, FlagsHttpApi, FlagsMockApi } from './flags-api';

/**
 * ADR-0011 claims "the Angular half of the call — interceptor, HTTP
 * implementations, mode selection — is covered by unit tests". The interceptor
 * was. The other two were not: no spec referenced FlagsHttpApi or
 * provideFlagsApi, so the implementation that talks to the edge and the switch
 * that decides whether to use it could both have been deleted with the suite
 * green.
 *
 * These are small surfaces, which is exactly why they went uncovered — and why
 * the claim was easy to make and easy to leave standing.
 */
describe('FlagsHttpApi', () => {
  let http: HttpTestingController;
  let api: FlagsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), FlagsHttpApi],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(FlagsHttpApi);
  });

  afterEach(() => http.verify());

  it('unwraps the { flags } envelope the BFF returns', () => {
    const seen: unknown[] = [];
    api.getFlags().subscribe((flags) => seen.push(flags));

    http.expectOne({ method: 'GET', url: '/api/flags' }).flush({
      flags: [{ key: 'new-dashboard', description: 'd', enabled: true }],
    });

    // the store consumes a bare array; leaking the envelope would break it
    expect(seen[0]).toEqual([{ key: 'new-dashboard', description: 'd', enabled: true }]);
  });

  it('PATCHes the flag with the enabled flag in the body', () => {
    api.setEnabled('bulk-export', true).subscribe();

    const request = http.expectOne({ method: 'PATCH', url: '/api/flags/bulk-export' });
    expect(request.request.body).toEqual({ enabled: true });
    request.flush({});
  });

  it('encodes a key that would otherwise change the path it addresses', () => {
    // a key containing a slash must not become an extra path segment: that
    // would miss the route entirely and, worse, address a different one
    api.setEnabled('team/beta', false).subscribe();

    http.expectOne({ method: 'PATCH', url: '/api/flags/team%2Fbeta' }).flush({});
  });

  it('uses a relative URL, so the interceptor recognises it as same-origin API', () => {
    api.getFlags().subscribe();

    const request = http.expectOne({ method: 'GET', url: '/api/flags' });
    expect(request.request.url.startsWith('/api/')).toBe(true);
    request.flush({ flags: [] });
  });
});

/**
 * The switch itself. ATLAS_API_MODE lives in @atlas/shared-util rather than
 * being declared per-project, because an InjectionToken's identity is the
 * object and not its description — a locally declared "same" token yields a
 * DIFFERENT one, so the shell's choice would be silently ignored and every
 * remote would fall back to its default. That shipped once (ADR-0011).
 */
describe('provideFlagsApi', () => {
  const resolve = (mode: 'mock' | 'http') => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ATLAS_API_MODE, useValue: mode },
        provideFlagsApi(),
      ],
    });
    return TestBed.inject(FlagsApi);
  };

  it('binds the HTTP implementation when the manifest says http', () => {
    expect(resolve('http')).toBeInstanceOf(FlagsHttpApi);
  });

  it('binds the mock when the manifest says mock', () => {
    expect(resolve('mock')).toBeInstanceOf(FlagsMockApi);
  });

  it('falls back to the mock when nothing provides a mode at all', () => {
    // the token's own default. A remote loaded outside the shell must not
    // start talking to an edge that is not there.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFlagsApi()],
    });

    expect(TestBed.inject(FlagsApi)).toBeInstanceOf(FlagsMockApi);
  });
});
