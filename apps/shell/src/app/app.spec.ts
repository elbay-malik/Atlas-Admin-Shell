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

  it('hides admin-only remotes from viewers', async () => {
    const auth = TestBed.inject(AtlasAuth);
    await auth.login('viewer');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Identity & Access');
  });
});
