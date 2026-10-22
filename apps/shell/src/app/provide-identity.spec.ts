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

  it('refuses to boot for a provider this build cannot serve', () => {
    expect(() =>
      provideIdentity({ kind: 'nhost', url: 'https://p.auth.eu-central-1.nhost.run' })
    ).toThrow(/no Nhost provider yet/);
  });

  it('names the mock explicitly when it refuses, so the reason is not guessed', () => {
    // If this message ever stops mentioning the fallback it is refusing, the
    // next person to read it will assume degrading was safe.
    expect(() =>
      provideIdentity({ kind: 'nhost', url: 'https://p.auth.eu-central-1.nhost.run' })
    ).toThrow(/mock/);
  });

  it('refuses a supabase config with no key rather than passing undefined on', () => {
    expect(() => provideIdentity({ kind: 'supabase', url: 'https://p.supabase.co' })).toThrow(
      /requires a publishableKey/
    );
  });

  it('refuses a kind it does not recognise', () => {
    expect(() =>
      provideIdentity({ kind: 'firebase' as 'supabase', url: 'https://p.example.com' })
    ).toThrow(/unknown auth\.kind/);
  });
});
