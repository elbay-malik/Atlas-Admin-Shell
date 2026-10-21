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
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { problems } from '../../../../../tools/check-manifests.mjs';
import { isAtlasManifest } from './manifest';

const CHECKER = new URL('../../../../../tools/check-manifests.mjs', import.meta.url).pathname;

/** Runs the real CLI and returns its exit code, so the receipt is the process. */
function runChecker(args) {
  try {
    execFileSync(process.execPath, [CHECKER, ...args], { stdio: 'pipe' });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

const validRemote = {
  url: 'https://iam.atlas.example/remoteEntry.json',
  displayName: 'Identity & Access',
  route: 'iam',
  icon: '👥',
  exposedModule: './Routes',
  requiredRole: 'admin',
};

/**
 * The fixture carries EVERY field the contract defines, optional ones included.
 * The mutation generator reads its shape rather than a hand-written list, and
 * `fieldsTheGuardInspects()` below fails if this fixture ever falls behind the
 * guard — which is what makes "a new field is covered automatically" true
 * rather than merely claimed.
 */
const base = { version: 1, apiMode: 'mock', remotes: { iam: validRemote } };

/** Structured clone that is cheap and dependency-free for plain JSON. */
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Values that are legal JSON but wrong for every field in this contract. */
const WRONG_VALUES = [undefined, null, 42, true, '', {}, []];

/**
 * Which property names `isAtlasManifest` actually reads, observed rather than
 * assumed: a recording Proxy over a VALID manifest (valid so the guard runs to
 * completion instead of short-circuiting) reports every key it touches.
 *
 * This is the piece that closes the loop. Deriving the mutation list from the
 * fixture only helps if the fixture keeps up with the contract; this makes
 * forgetting the fixture a failing test rather than silent lost coverage.
 */
function fieldsTheGuardInspects() {
  const seen = [];
  const record = (path) => seen.push(path);
  const spy = (target, path = []) =>
    new Proxy(target, {
      get(object, property, receiver) {
        if (typeof property === 'string') record([...path, property]);
        const value = Reflect.get(object, property, receiver);
        return value && typeof value === 'object' && !Array.isArray(value)
          ? spy(value, [...path, property])
          : value;
      },
    });

  isAtlasManifest(spy(clone(base)));

  const top = new Set(seen.filter((p) => p.length === 1).map((p) => p[0]));
  // ['remotes', '<name>', '<field>']
  const remote = new Set(seen.filter((p) => p.length === 3 && p[0] === 'remotes').map((p) => p[2]));
  return { top, remote };
}

const TOP_LEVEL_FIELDS = Object.keys(base);
const REMOTE_FIELDS = Object.keys(base.remotes.iam);

/**
 * Every way this manifest can be malformed that either implementation could
 * plausibly have an opinion about. The field lists are DERIVED from the
 * fixture, so adding a field there covers it everywhere below.
 */
function mutations() {
  const cases = [];

  for (const value of WRONG_VALUES) {
    for (const field of TOP_LEVEL_FIELDS) {
      const manifest = clone(base);
      if (value === undefined) delete manifest[field];
      else manifest[field] = value;
      cases.push([`${field} = ${JSON.stringify(value)}`, manifest]);
    }
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

  /**
   * The guard against this file quietly going stale. If a field is added to
   * AtlasManifest and to isAtlasManifest but NOT to `base`, every mutation
   * above silently stops covering it — which is exactly how `apiMode` rotted
   * out of the deploy validator in the first place. Asking the guard what it
   * reads makes that omission fail here instead of shipping.
   */
  it('has a fixture covering every field the runtime guard inspects', () => {
    const { top, remote } = fieldsTheGuardInspects();

    const missingTop = [...top].filter((f) => !TOP_LEVEL_FIELDS.includes(f));
    const missingRemote = [...remote].filter((f) => !REMOTE_FIELDS.includes(f));

    expect(missingTop, `add these to \`base\`: ${missingTop.join(', ')}`).toEqual([]);
    expect(
      missingRemote,
      `add these to \`validRemote\`: ${missingRemote.join(', ')}`
    ).toEqual([]);
    // and prove the observation actually observed something
    expect(top.size).toBeGreaterThan(0);
    expect(remote.size).toBeGreaterThan(0);
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

/**
 * The deploy pre-flight. `manifest:check` validates whatever manifests happen
 * to exist, which does NOT answer "can this deploy proceed" — and the deploy
 * workflow publishes the three remotes two steps after it. Selecting an
 * environment with no manifest therefore used to publish the remotes and only
 * then fail on the shell, leaving the platform half-deployed.
 */
describe('check-manifests --require (deploy pre-flight)', () => {
  it('accepts an environment that exists', () => {
    expect(runChecker(['--require', 'production'])).toBe(0);
  });

  it('REFUSES an environment with no manifest, so nothing deploys', () => {
    expect(runChecker(['--require', 'preview'])).toBe(1);
  });

  it('refuses a bare --require with no environment name', () => {
    expect(runChecker(['--require'])).toBe(1);
  });

  it('still passes with no --require at all, for plain CI validation', () => {
    expect(runChecker([])).toBe(0);
  });
});
