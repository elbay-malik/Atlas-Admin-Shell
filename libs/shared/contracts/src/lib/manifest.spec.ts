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
    const { requiredRole: _dropped, ...broken } = validRemote;
    expect(isAtlasManifest({ version: 1, remotes: { iam: broken } })).toBe(false);
  });

  it('rejects invalid roles', () => {
    expect(
      isAtlasManifest({ version: 1, remotes: { iam: { ...validRemote, requiredRole: 'root' } } })
    ).toBe(false);
  });
});
