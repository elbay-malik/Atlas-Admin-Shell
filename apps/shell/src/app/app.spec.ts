import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AtlasAuth, AuthUser, MockAtlasAuth } from '@atlas/shared-auth';
import { AtlasManifest } from '@atlas/shared-contracts';
import { App } from './app';
import { ATLAS_MANIFEST } from './manifest.token';
import { ShellNotice } from './notice/shell-notice';

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

  describe('the shell notice', () => {
    const region = (el: HTMLElement) => el.querySelector('[data-testid="shell-notice"]');

    it('is in the DOM and silent before anything has happened', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const live = region(fixture.nativeElement);

      expect(live?.getAttribute('role')).toBe('status');
      expect(live?.getAttribute('aria-live')).toBe('polite');
      expect(live?.textContent).toBe('');
      expect(fixture.nativeElement.querySelector('[data-testid="shell-notice-dismiss"]')).toBeNull();
    });

    it('shows a message in the same element, which keeps it announceable', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const live = region(fixture.nativeElement);

      TestBed.inject(ShellNotice).show('Signed out.');
      await fixture.whenStable();

      expect(region(fixture.nativeElement)).toBe(live);
      expect(live?.textContent).toBe('Signed out.');
    });

    it('can be dismissed, moving focus somewhere real', async () => {
      const fixture = TestBed.createComponent(App);
      document.body.appendChild(fixture.nativeElement);
      TestBed.inject(ShellNotice).show('Signed out.');
      await fixture.whenStable();

      fixture.nativeElement.querySelector('[data-testid="shell-notice-dismiss"]').click();
      await fixture.whenStable();

      expect(region(fixture.nativeElement)?.textContent).toBe('');
      expect(document.activeElement?.id).toBe('main-content');
      fixture.nativeElement.remove();
    });
  });

  describe('the identity in the header', () => {
    /** What toAuthUser produces for a token with no display name and no email. */
    const RAW_ID = '3f6c2a10-7d4e-4b8a-9c21-5e0f7a2c91c6';

    function signedInAs(name: string) {
      const user = signal<AuthUser>({ id: RAW_ID, name, email: '', role: 'viewer' });
      Object.defineProperty(TestBed.inject(AtlasAuth), 'user', { value: user });
    }

    it('labels a raw id rather than printing it', async () => {
      signedInAs(RAW_ID);
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const header = fixture.nativeElement.querySelector('[data-testid="identity-fallback"]');

      expect(header?.textContent).toContain('Account');
      expect(header?.textContent).toContain('3f6c…91c6');
      expect(fixture.nativeElement.querySelector('header')?.textContent).not.toContain(RAW_ID);
    });

    it('shows a real name as it is', async () => {
      signedInAs('Grace Hopper');
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('[data-testid="identity-fallback"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('header')?.textContent).toContain('Grace Hopper');
    });
  });
});
