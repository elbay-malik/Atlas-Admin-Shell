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

  it('rejects invalid roles', () => {
    expect(
      isAtlasManifest({ version: 1, remotes: { iam: { ...validRemote, requiredRole: 'root' } } })
    ).toBe(false);
  });
});
