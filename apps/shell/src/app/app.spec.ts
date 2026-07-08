import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
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
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: ATLAS_MANIFEST, useValue: manifest }],
    }).compileComponents();
  });

  it('renders the chrome with manifest-derived nav', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Atlas Admin');
    expect(el.textContent).toContain('Identity & Access');
  });
});
