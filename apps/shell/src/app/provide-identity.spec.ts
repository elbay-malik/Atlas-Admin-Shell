import { TestBed } from '@angular/core/testing';
import { AtlasAuth, MockAtlasAuth } from '@atlas/shared-auth';
import { ATLAS_API_MODE } from '@atlas/shared-util';
import { provideIdentity, resolveManifest } from '../bootstrap';
import { DEMO_SESSION, DemoAtlasAuth, isDemoAvailable } from './auth/demo-session';

/**
 * The safety-critical branch is the one that does NOT exist yet.
 *
 * `auth.kind` can now name a provider this build cannot serve, and the failure
 * mode to avoid is subtle: a manifest that FAILS the contract degrades to zero
 * remotes, which makes the mock provider harmless — mock auth with nothing to
 * reach grants access to nothing. But a manifest that PASSES the contract keeps
 * its remotes, so a quiet fallback here would pair real domains with a provider
 * where any visitor picks their own role.
 */
describe('provideIdentity', () => {
  it('uses the mock when no auth is configured at all', () => {
    // A fresh checkout, CI, and a reviewer with no account all land here.
    expect(() => provideIdentity(undefined)).not.toThrow();
  });

  it('installs the real provider for the configured identity project', () => {
    expect(() =>
      provideIdentity({ kind: 'nhost', url: 'https://p.auth.eu-central-1.nhost.run/v1' })
    ).not.toThrow();
  });

  /**
   * The retired provider must fail LOUDLY rather than degrade. A manifest is a
   * deployment artifact that ships independently of this bundle (ADR-0010), so
   * one naming the old provider can outlive its implementation — and the
   * fallback would be the mock, paired with real remotes, where any visitor
   * picks their own role.
   */
  it('refuses a provider this build no longer implements', () => {
    expect(() => provideIdentity({ kind: 'supabase', url: 'https://p.supabase.co' })).toThrow(
      /no longer supported/
    );
  });

  it('names the mock explicitly when it refuses, so the reason is not guessed', () => {
    // If this message ever stops mentioning the fallback it is refusing, the
    // next person to read it will assume degrading was safe.
    expect(() => provideIdentity({ kind: 'supabase', url: 'https://p.supabase.co' })).toThrow(
      /mock/
    );
  });

  it('refuses a kind it does not recognise', () => {
    expect(() =>
      provideIdentity({ kind: 'firebase' as 'supabase', url: 'https://p.example.com' })
    ).toThrow(/unknown auth\.kind/);
  });

  /**
   * The demo is added beside a provider, never instead of one: ADR-0014's refusal
   * has to hold even on a manifest that would otherwise offer it.
   */
  it('still refuses an unknown or retired provider when the demo is offered', () => {
    expect(() =>
      provideIdentity({ kind: 'firebase' as 'supabase', url: 'https://p.example.com' }, true)
    ).toThrow(/unknown auth\.kind/);
    expect(() => provideIdentity({ kind: 'supabase', url: 'https://p.supabase.co' }, true)).toThrow(
      /no longer supported/
    );
  });

  describe('the demo, in the injector', () => {
    function install(offerDemo: boolean, apiMode: 'mock' | 'http') {
      TestBed.configureTestingModule({
        providers: [provideIdentity(undefined, offerDemo), { provide: ATLAS_API_MODE, useValue: apiMode }],
      });
    }

    it('does not exist when it is not offered', () => {
      install(false, 'http');
      expect(TestBed.inject(DEMO_SESSION, null)).toBeNull();
      expect(TestBed.inject(AtlasAuth)).toBeInstanceOf(MockAtlasAuth);
    });

    it('wraps the selected provider when it is', () => {
      install(true, 'mock');
      expect(TestBed.inject(AtlasAuth)).toBeInstanceOf(DemoAtlasAuth);
      expect(TestBed.inject(DEMO_SESSION)).toBe(TestBed.inject(AtlasAuth));
    });

    it('fails closed if it is ever installed under apiMode http', () => {
      install(true, 'http');
      expect(() => TestBed.inject(AtlasAuth)).toThrow(/only when apiMode is "mock"/);
    });
  });
});

describe('isDemoAvailable', () => {
  const remotes = {
    iam: {
      url: 'http://localhost:4201/remoteEntry.json',
      displayName: 'IAM',
      route: 'iam',
      icon: 'users',
      exposedModule: './Routes',
      requiredRole: 'admin',
    },
  };

  it('is available on an explicit or a defaulted mock', () => {
    expect(isDemoAvailable(resolveManifest({ version: 1, apiMode: 'mock', remotes }))).toBe(true);
    expect(isDemoAvailable(resolveManifest({ version: 1, remotes }))).toBe(true);
  });

  it('is not available under http', () => {
    expect(isDemoAvailable(resolveManifest({ version: 1, apiMode: 'http', remotes }))).toBe(false);
  });

  /**
   * An out-of-contract apiMode must not read as "not http, so mock". The contract
   * guard turns the manifest into zero remotes, and zero remotes offer no demo.
   */
  it('fails closed on a manifest that fails the contract', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(isDemoAvailable(resolveManifest({ version: 1, apiMode: 'HTTP', remotes }))).toBe(false);
    expect(isDemoAvailable(resolveManifest('not a manifest'))).toBe(false);
    spy.mockRestore();
  });
});
