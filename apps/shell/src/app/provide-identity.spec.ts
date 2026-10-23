import { provideIdentity } from '../bootstrap';

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
});
