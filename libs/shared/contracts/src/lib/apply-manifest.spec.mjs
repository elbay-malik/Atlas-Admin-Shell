/**
 * `tools/apply-manifest.mjs` is the one step that decides WHICH environment a
 * deploy actually ships, and it had no test of any kind. CI never executed it
 * either — `deploy -c check` overrides the command list, so the `check`
 * configuration runs wrangler alone and never touches this script.
 *
 * It lives here rather than beside the script because `tools/` is not an Nx
 * project and has no test target. This project already reaches into `tools/`
 * for the validator parity suite, and `sharedGlobals` now marks every project
 * affected by a `tools/**` change (ADR-0009), so these run whenever the script
 * they cover is edited.
 *
 * The script is driven as a real process, because its contract IS its exit code
 * and its side effect on disk — asserting against an imported function would
 * test something the deploy never calls.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = new URL('../../../../../tools/apply-manifest.mjs', import.meta.url).pathname;
const REPO = new URL('../../../../../', import.meta.url).pathname;
const SOURCE = join(REPO, 'deploy/manifests/production/federation.manifest.json');

let out;

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'atlas-apply-'));
});
afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

/** Runs the real script and returns { code, stderr }. */
function run(args) {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], { stdio: 'pipe' });
    return { code: 0, stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stderr: String(error.stderr ?? '') };
  }
}

const applied = () => readFileSync(join(out, 'federation.manifest.json'), 'utf8');

describe('apply-manifest', () => {
  it('copies the requested environment byte for byte', () => {
    const result = run(['production', '--out', out]);

    expect(result.code).toBe(0);
    expect(applied()).toBe(readFileSync(SOURCE, 'utf8'));
  });

  it('applies a manifest the shell can actually boot from', () => {
    run(['production', '--out', out]);
    const manifest = JSON.parse(applied());

    // the properties the console depends on, not merely "it is JSON"
    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.remotes).length).toBeGreaterThan(0);
    for (const [name, def] of Object.entries(manifest.remotes)) {
      expect(def.url, `${name} must be absolute in a deployed manifest`).toMatch(/^https:\/\//);
    }
  });

  it('refuses an environment that does not exist, and writes nothing', () => {
    const result = run(['nope', '--out', out]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/no manifest for "nope"/);
    expect(() => applied()).toThrow();
  });

  it('refuses when no environment is named', () => {
    const result = run(['--out', out]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/environment is required/);
  });

  it('refuses when the build output is missing, rather than creating it', () => {
    // a deploy that "succeeds" into a directory nobody uploads is worse than a
    // failure, because the upload then ships whatever was there before
    const result = run(['production', '--out', join(out, 'not-built')]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/does not exist/);
  });

  it('refuses a source manifest that is not valid JSON, before copying it', () => {
    const envDir = join(REPO, 'deploy/manifests/__spec_broken__');
    mkdirSync(envDir, { recursive: true });
    writeFileSync(join(envDir, 'federation.manifest.json'), '{ not json');
    try {
      const result = run(['__spec_broken__', '--out', out]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/not valid JSON/);
      // the point of parsing first: nothing reached the build output
      expect(() => applied()).toThrow();
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  });

  /**
   * Found by writing these tests. The environment used to be "the first
   * argument that does not start with --", which swallowed the value belonging
   * to `--out`: `apply-manifest --out dist production` deployed an environment
   * named "dist". Argument ORDER decided what shipped, silently, in the one
   * step that chooses what a deploy publishes.
   */
  it('reads the environment correctly whichever side of --out it sits on', () => {
    const before = run(['--out', out, 'production']);
    expect(before.code, before.stderr).toBe(0);
    expect(applied()).toBe(readFileSync(SOURCE, 'utf8'));

    rmSync(join(out, 'federation.manifest.json'), { force: true });

    const after = run(['production', '--out', out]);
    expect(after.code, after.stderr).toBe(0);
    expect(applied()).toBe(readFileSync(SOURCE, 'utf8'));
  });

  /**
   * Found by running the deploy, not by running the suite. The fix above
   * excluded "the argument after --out" by index — but with --out absent that
   * index is 0, which excluded the first positional, i.e. the environment.
   *
   * Every test in this file passes --out, because they all need a temp
   * directory. So the one invocation the deploy target actually makes,
   * `apply-manifest.mjs production`, was the one shape nothing exercised: a
   * suite written around a bug fix inherited the fix's blind spot.
   *
   * This asserts on the REJECTION, not on a successful copy: without --out the
   * script writes into dist/apps/shell/browser, so a passing test would depend
   * on the shell having been built and would clobber a real build output.
   * Getting as far as "the build output does not exist" already proves the
   * environment was parsed — the failure under test could not reach that line.
   */
  it('reads the environment when --out is absent, as the deploy target invokes it', () => {
    const result = run(['production']);

    expect(result.stderr).not.toMatch(/an environment is required/);
    expect(result.stderr).not.toMatch(/no manifest for/);
  });

  it('refuses --out with no directory after it', () => {
    const result = run(['production', '--out']);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--out needs a directory/);
  });
});
