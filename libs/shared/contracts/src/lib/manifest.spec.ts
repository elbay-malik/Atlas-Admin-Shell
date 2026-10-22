import { isAtlasManifest } from './manifest';

const validRemote = {
  url: 'http://localhost:4201/remoteEntry.json',
  displayName: 'Identity & Access',
  route: 'iam',
  icon: '👥',
  exposedModule: './Routes',
  requiredRole: 'admin',
};

describe('isAtlasManifest (contract)', () => {
  it('accepts a well-formed manifest', () => {
    expect(isAtlasManifest({ version: 1, remotes: { iam: validRemote } })).toBe(true);
  });

  it('rejects unknown versions', () => {
    expect(isAtlasManifest({ version: 2, remotes: {} })).toBe(false);
  });

  it('rejects remotes with missing fields', () => {
    const broken: Partial<typeof validRemote> = { ...validRemote };
    delete broken.requiredRole;
    expect(isAtlasManifest({ version: 1, remotes: { iam: broken } })).toBe(false);
  });

  it('rejects a null or non-object remote entry without throwing', () => {
    // legal JSON that a templating step can easily emit; dereferencing it
    // inside the guard used to throw and take the whole shell down
    expect(() => isAtlasManifest({ version: 1, remotes: { iam: null } })).not.toThrow();
    expect(isAtlasManifest({ version: 1, remotes: { iam: null } })).toBe(false);
    expect(isAtlasManifest({ version: 1, remotes: { iam: 'nope' } })).toBe(false);
    expect(isAtlasManifest({ version: 1, remotes: { iam: 42 } })).toBe(false);
  });

  it('accepts an absent or valid apiMode, and rejects anything else', () => {
    const base = { version: 1, remotes: { iam: validRemote } };
    expect(isAtlasManifest(base)).toBe(true); // absent means mock
    expect(isAtlasManifest({ ...base, apiMode: 'mock' })).toBe(true);
    expect(isAtlasManifest({ ...base, apiMode: 'http' })).toBe(true);
    expect(isAtlasManifest({ ...base, apiMode: 'real' })).toBe(false);
    expect(isAtlasManifest({ ...base, apiMode: true })).toBe(false);
  });

  it('rejects invalid roles', () => {
    expect(
      isAtlasManifest({ version: 1, remotes: { iam: { ...validRemote, requiredRole: 'root' } } })
    ).toBe(false);
  });

  /**
   * `auth` decides WHICH identity provider an environment uses, so a malformed
   * block must not be quietly dropped: falling back to the mock would let
   * anyone pick the 'admin' persona. Failing the whole manifest degrades the
   * console to zero remotes, which is visibly broken rather than permissive.
   */
  describe('the optional auth block', () => {
    const auth = {
      url: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      provider: 'github',
    };
    const withAuth = (value: unknown) => ({ version: 1, auth: value, remotes: {} });

    it('accepts a well-formed block, with and without the optional provider', () => {
      expect(isAtlasManifest(withAuth(auth))).toBe(true);
      expect(isAtlasManifest(withAuth({ url: auth.url, publishableKey: auth.publishableKey }))).toBe(true);
    });

    it('accepts a manifest with no auth at all — that is the mock provider', () => {
      expect(isAtlasManifest({ version: 1, remotes: {} })).toBe(true);
    });

    it.each([
      ['a missing url', { publishableKey: 'k' }],
      ['an empty url', { url: '', publishableKey: 'k' }],
      ['a missing key', { url: 'https://p.supabase.co' }],
      ['an empty key', { url: 'https://p.supabase.co', publishableKey: '' }],
      ['an empty provider', { url: 'https://p.supabase.co', publishableKey: 'k', provider: '' }],
      ['a non-object', 'nope'],
      ['null', null],
      ['a number', 42],
    ])('rejects the WHOLE manifest for %s', (_label, value) => {
      expect(isAtlasManifest(withAuth(value))).toBe(false);
    });
  });
});
