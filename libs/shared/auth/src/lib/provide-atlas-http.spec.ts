import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AtlasAuth } from './atlas-auth';
import { MockAtlasAuth } from './mock-atlas-auth';
import { provideAtlasHttp } from './provide-atlas-http';

/**
 * The interceptor awaits getAccessToken() before issuing the request, so an
 * API call is deferred by a microtask and expectOne would otherwise run first.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('atlasAuthInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: MockAtlasAuth;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AtlasAuth, useClass: MockAtlasAuth },
        provideAtlasHttp(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AtlasAuth) as MockAtlasAuth;
  });

  afterEach(() => {
    controller.verify();
    localStorage.clear();
  });

  it('attaches the bearer token to an API call', async () => {
    await auth.login('admin');
    http.get('/api/flags').subscribe();
    await settle();

    const request = controller.expectOne('/api/flags');
    expect(request.request.headers.get('Authorization')).toBe('Bearer mock.u-admin.admin');
    request.flush({});
  });

  it('sends no Authorization header when nobody is signed in', async () => {
    http.get('/api/flags').subscribe();
    await settle();

    const request = controller.expectOne('/api/flags');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  /**
   * The guard that matters. Without it the token would ride along on every
   * cross-origin remoteEntry.json and chunk fetch, handing each remote's CDN a
   * credential it has no business seeing.
   *
   * Note this case alone does NOT exercise the origin check — /remoteEntry.json
   * fails the path test too, so it passed even while the origin check was
   * missing. The cases below are the ones that pin it.
   */
  it('never attaches the token to a cross-origin federation fetch', async () => {
    await auth.login('admin');
    http.get('http://localhost:4201/remoteEntry.json').subscribe();

    const request = controller.expectOne('http://localhost:4201/remoteEntry.json');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  /**
   * THE REGRESSION TEST. Until 2026-09-23 the guard resolved the URL and then
   * checked only its PATHNAME, so any foreign origin serving /api/ was handed a
   * live bearer token. Every other case in this file passes on the path check
   * alone, which is why the hole survived: the suite was green with no origin
   * check at all.
   */
  it.each([
    'https://evil.example/api/steal',
    'http://localhost:4201/api/anything',
    'https://iam.atlas.example/api/iam/users',
  ])('never attaches the token to cross-origin %s', async (url) => {
    await auth.login('admin');
    http.get(url).subscribe();
    await settle();

    const request = controller.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('still attaches the token to an absolute SAME-origin API url', async () => {
    await auth.login('admin');
    const url = `${location.origin}/api/flags`;
    http.get(url).subscribe();
    await settle();

    const request = controller.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer mock.u-admin.admin');
    request.flush({});
  });

  it('fails closed on an unparseable url rather than throwing out of the interceptor', async () => {
    await auth.login('admin');
    const url = 'http://[::1';
    expect(() => http.get(url).subscribe()).not.toThrow();
    await settle();

    const request = controller.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('never attaches the token to a same-origin non-API request', async () => {
    await auth.login('admin');
    http.get('/federation.manifest.json').subscribe();

    const request = controller.expectOne('/federation.manifest.json');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('does not treat a path merely containing /api/ as an API call', async () => {
    await auth.login('admin');
    http.get('https://cdn.example/assets/api/thing.json').subscribe();

    const request = controller.expectOne('https://cdn.example/assets/api/thing.json');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
