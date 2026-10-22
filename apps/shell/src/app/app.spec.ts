import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AtlasAuth, MockAtlasAuth } from '@atlas/shared-auth';
import { AtlasManifest } from '@atlas/shared-contracts';
import { App } from './app';
import { ATLAS_MANIFEST } from './manifest.token';

const manifest: AtlasManifest = {
  version: 1,
  remotes: {
    iam: {
      url: 'http://localhost:4201/remoteEntry.json',
      displayName: 'Identity & Access',
      route: 'iam',
      icon: '👥',
      exposedModule: './Routes',
      requiredRole: 'admin',
    },
  },
};

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ATLAS_MANIFEST, useValue: manifest },
        { provide: AtlasAuth, useClass: MockAtlasAuth },
      ],
    }).compileComponents();
  });

  it('renders the chrome', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Atlas Admin');
  });

  it('shows manifest-derived nav once the user has the required role', async () => {
    const auth = TestBed.inject(AtlasAuth);
    await auth.login('admin');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Identity & Access');
  });

  /*
   * This used to assert that an admin-only remote was HIDDEN from a viewer, and
   * that was the wrong contract in two ways.
   *
   * It leaked nothing to hide: federation.manifest.json is fetched before
   * authentication and publishes every remote with its requiredRole, because
   * the shell builds its router and nav from it (ADR-0004). Existence is public
   * by design. And it produced the console's worst screen — a signed-out
   * visitor saw an empty sidebar beneath copy telling them to pick a domain
   * from it.
   *
   * The contract now: every domain is listed; the role gate decides whether an
   * item is REACHABLE, not whether it exists. What must stay true is that a
   * viewer cannot navigate to it — which is this test's real subject, and is
   * enforced by canMatch and by the edge regardless of the markup (ADR-0011).
   */
  it('lists admin-only remotes for viewers, but does not let them in', async () => {
    const auth = TestBed.inject(AtlasAuth);
    await auth.login('viewer');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Identity & Access');

    const item = el.querySelector('[data-testid="nav-iam"] a');
    expect(item, 'the admin-only domain must still be rendered').not.toBeNull();
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    // No href: the item announces the domain and the role it needs, and is not
    // a link that would bounce the viewer back to the overview.
    expect(item?.hasAttribute('href')).toBe(false);
    expect(item?.textContent).toContain('admin');
  });
});
