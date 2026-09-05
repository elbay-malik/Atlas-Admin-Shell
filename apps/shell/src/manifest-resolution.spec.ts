import { AtlasManifest } from '@atlas/shared-contracts';
import { resolveManifest } from './bootstrap';

const valid: AtlasManifest = {
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

describe('resolveManifest', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => consoleError.mockRestore());

  it('passes a valid manifest through untouched', () => {
    expect(resolveManifest(valid)).toBe(valid);
    expect(consoleError).not.toHaveBeenCalled();
  });

  /**
   * The shell must still boot: chrome, auth and the overview keep working and
   * every domain simply reads as unavailable (ADR-0007).
   */
  it.each([
    ['an unknown version', { version: 99, remotes: {} }],
    ['a remote missing required fields', { version: 1, remotes: { iam: { url: 'x' } } }],
    ['a non-object', 'not a manifest'],
    ['null', null],
  ])('degrades to zero remotes for %s, loudly', (_label, raw) => {
    const manifest = resolveManifest(raw);
    expect(manifest).toEqual({ version: 1, remotes: {} });
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
