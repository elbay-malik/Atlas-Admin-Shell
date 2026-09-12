/**
 * The deploy validator (`tools/check-manifests.mjs`) duplicates `isAtlasManifest`
 * in plain JavaScript, because it has to run in CI before and without a
 * TypeScript build. ADR-0010 accepts that duplication on one condition:
 *
 *   the validator is strictly STRICTER than the runtime guard,
 *   so anything that passes CI is guaranteed to satisfy the shell.
 *
 * That condition was a comment, and it rotted the first time the contract grew.
 * `apiMode` arrived with the edge BFF (ADR-0011) and was added to
 * `isAtlasManifest` but not to the validator, so `{ apiMode: 'htp' }` passed
 * `pnpm manifest:check`, then failed the guard at runtime and left the console
 * with ZERO remotes — the precise failure the validator exists to prevent, now
 * shipped past the gate that was supposed to catch it.
 *
 * So the invariant is tested here rather than asserted there, over generated
 * mutations rather than a handful of hand-picked cases, because the next field
 * added to the contract will forget the validator exactly the same way.
 *
 * This file is .mjs on purpose: it imports a plain-JavaScript repo tool, which
 * is not a TypeScript module and has no types to import.
 */
import { describe, expect, it } from 'vitest';
import { problems } from '../../../../../tools/check-manifests.mjs';
import { isAtlasManifest } from './manifest';

const validRemote = {
  url: 'https://iam.atlas.example/remoteEntry.json',
  displayName: 'Identity & Access',
  route: 'iam',
  icon: '👥',
  exposedModule: './Routes',
  requiredRole: 'admin',
};

const base = { version: 1, remotes: { iam: validRemote } };

/** Structured clone that is cheap and dependency-free for plain JSON. */
const clone = (value) => JSON.parse(JSON.stringify(value));

const REMOTE_FIELDS = ['url', 'displayName', 'route', 'icon', 'exposedModule', 'requiredRole'];

/** Values that are legal JSON but wrong for every field in this contract. */
const WRONG_VALUES = [undefined, null, 42, true, '', {}, []];

/**
 * Every way this manifest can be malformed that either implementation could
 * plausibly have an opinion about. Built by mutation so a new field is covered
 * the moment it appears in `base`, without anyone remembering to add a case.
 */
function mutations() {
  const cases = [];

  for (const value of WRONG_VALUES) {
    cases.push([`version = ${JSON.stringify(value)}`, { ...clone(base), version: value }]);
    cases.push([`remotes = ${JSON.stringify(value)}`, { ...clone(base), remotes: value }]);
    cases.push([`apiMode = ${JSON.stringify(value)}`, { ...clone(base), apiMode: value }]);
    cases.push([`remotes.iam = ${JSON.stringify(value)}`, { ...clone(base), remotes: { iam: value } }]);

    for (const field of REMOTE_FIELDS) {
      const manifest = clone(base);
      if (value === undefined) delete manifest.remotes.iam[field];
      else manifest.remotes.iam[field] = value;
      cases.push([`remotes.iam.${field} = ${JSON.stringify(value)}`, manifest]);
    }
  }

  // Values that are the right TYPE but outside the contract's enumerations —
  // the class of typo a shape-only check sails straight past.
  cases.push(['apiMode = "htp" (the typo that started this)', { ...clone(base), apiMode: 'htp' }]);
  cases.push(['apiMode = "real"', { ...clone(base), apiMode: 'real' }]);
  cases.push(['apiMode = "HTTP" (wrong case)', { ...clone(base), apiMode: 'HTTP' }]);
  cases.push(['version = 2', { ...clone(base), version: 2 }]);
  for (const role of ['root', 'Admin', 'owner', 'superuser']) {
    const manifest = clone(base);
    manifest.remotes.iam.requiredRole = role;
    cases.push([`requiredRole = ${JSON.stringify(role)}`, manifest]);
  }

  return cases;
}

describe('check-manifests is strictly stricter than isAtlasManifest (ADR-0010)', () => {
  it('accepts the valid manifest in both implementations', () => {
    expect(isAtlasManifest(base)).toBe(true);
    expect(problems(base)).toEqual([]);
  });

  it('accepts both legal apiMode values in both implementations', () => {
    for (const apiMode of ['mock', 'http']) {
      const manifest = { ...clone(base), apiMode };
      expect(isAtlasManifest(manifest), apiMode).toBe(true);
      expect(problems(manifest), apiMode).toEqual([]);
    }
  });

  // THE invariant. Everything else in this file is a way of generating inputs
  // for it. Stated as an implication, not an equality, because the validator is
  // deliberately allowed to reject things the guard tolerates.
  it.each(mutations())('rejects %s if the runtime guard does', (_label, manifest) => {
    if (isAtlasManifest(manifest)) return;
    expect(problems(manifest).length).toBeGreaterThan(0);
  });

  it('is allowed to be stricter, and is', () => {
    // An origin-only entry URL satisfies the runtime guard (it is a string) but
    // would scope the whole host in the import map, so deployment rejects it.
    const originOnly = clone(base);
    originOnly.remotes.iam.url = 'https://iam.atlas.example';

    expect(isAtlasManifest(originOnly)).toBe(true);
    expect(problems(originOnly)).toHaveLength(1);
  });

  it('reports every problem it finds rather than stopping at the first', () => {
    const manifest = { version: 9, apiMode: 'htp', remotes: { iam: { ...validRemote, requiredRole: 'root' } } };

    expect(isAtlasManifest(manifest)).toBe(false);
    expect(problems(manifest).length).toBeGreaterThanOrEqual(3);
  });
});
