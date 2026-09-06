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
   */
  it('never attaches the token to a cross-origin federation fetch', async () => {
    await auth.login('admin');
    http.get('http://localhost:4201/remoteEntry.json').subscribe();

    const request = controller.expectOne('http://localhost:4201/remoteEntry.json');
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
