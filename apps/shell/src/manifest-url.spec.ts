import { manifestUrl, resolveRemoteUrls } from './manifest-url';

describe('manifestUrl', () => {
  it('resolves next to the base href, not next to the current route', () => {
    // a deep link must not ask for /unavailable/federation.manifest.json
    expect(manifestUrl('http://localhost:4200/')).toBe(
      'http://localhost:4200/federation.manifest.json'
    );
    expect(manifestUrl('https://atlas.example/')).toBe(
      'https://atlas.example/federation.manifest.json'
    );
  });

  it('honours a sub-path base href', () => {
    expect(manifestUrl('https://atlas.example/console/')).toBe(
      'https://atlas.example/console/federation.manifest.json'
    );
  });
});

describe('resolveRemoteUrls', () => {
  const base = 'https://atlas.example/federation.manifest.json';

  it('passes absolute URLs through byte-identically', () => {
    // this is the committed dev/e2e manifest shape — it must not change
    const manifest = {
      remotes: { iam: { url: 'http://localhost:4201/remoteEntry.json' } },
    };
    expect(resolveRemoteUrls(manifest, 'http://localhost:4200/federation.manifest.json')).toEqual({
      iam: 'http://localhost:4201/remoteEntry.json',
    });
  });

  it('absolutises a path-routed URL against the manifest, for same-origin previews', () => {
    const manifest = { remotes: { iam: { url: '/iam/remoteEntry.json' } } };
    expect(resolveRemoteUrls(manifest, base)).toEqual({
      iam: 'https://atlas.example/iam/remoteEntry.json',
    });
  });

  it('writes the resolved URL back, so every later consumer sees one string', () => {
    // RemoteLoader probes def.url and hands it to initRemoteEntry; it must be
    // the same string the import map was built from
    const manifest = { remotes: { iam: { url: '/iam/remoteEntry.json' } } };
    resolveRemoteUrls(manifest, base);
    expect(manifest.remotes.iam.url).toBe('https://atlas.example/iam/remoteEntry.json');
  });

  it('skips entries with no usable URL instead of coercing them', () => {
    const manifest = {
      remotes: {
        ok: { url: '/iam/remoteEntry.json' },
        missing: {},
        empty: { url: '' },
        wrongType: { url: 42 },
      },
    };
    expect(Object.keys(resolveRemoteUrls(manifest, base))).toEqual(['ok']);
  });

  it('skips an unparseable URL loudly rather than throwing', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const manifest = { remotes: { broken: { url: 'http://[' } } };

    expect(() => resolveRemoteUrls(manifest, base)).not.toThrow();
    expect(resolveRemoteUrls(manifest, base)).toEqual({});
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('tolerates a manifest with no remotes at all', () => {
    expect(resolveRemoteUrls({ version: 1, remotes: {} }, base)).toEqual({});
    expect(resolveRemoteUrls(null, base)).toEqual({});
    expect(resolveRemoteUrls('nonsense', base)).toEqual({});
  });
});
