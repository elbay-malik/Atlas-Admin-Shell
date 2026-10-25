/**
 * `bundles:check` (tools/check-remote-bundles.mjs) is the last line of defence
 * for ADR-0006: no remote may ship the identity client.
 *
 * For its first life it could only see vendor SDKs. The client the shell
 * actually ships is hand-written fetch calls, so moving it into a shared lib
 * would have put it in every remote with the gate still green — a protection
 * nothing probed. These tests run the gate against fixture bundles: one that
 * leaks the client, and ones whose needles have gone stale, so the gate's
 * blindness is a failure rather than a pass.
 *
 * This file is .mjs on purpose: it imports a plain-JavaScript repo tool, which
 * is not a TypeScript module and has no types to import.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIENT_SOURCE,
  NEEDLES_BY_CLIENT,
  REMOTES,
  problems,
} from '../../../../../tools/check-remote-bundles.mjs';

const CHECKER = fileURLToPath(new URL('../../../../../tools/check-remote-bundles.mjs', import.meta.url));

/** Roughly what the client looks like once minified: the strings survive, names do not. */
const MINIFIED_CLIENT =
  'var a=class{signIn(e){let t=new URL(`${this.b}/signin/provider/${encodeURIComponent(e)}`);' +
  'location.assign(t.toString())}x(n){console.warn("[atlas-auth] session could not be refreshed",n)}};';
const HARMLESS = 'var p="atlas.auth.persona";export{p};';

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-bundles-'));
  dirs.push(dir);
  return dir;
}

/** Builds a dist/apps lookalike; `files` maps app name to that app's one chunk. */
function fixture(files) {
  const root = tempDir();
  for (const [app, source] of Object.entries(files)) {
    const dir = join(root, app, 'browser');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'chunk-TEST.js'), source);
  }
  return root;
}

const clean = () => ({
  shell: MINIFIED_CLIENT,
  ...Object.fromEntries(REMOTES.map((remote) => [remote, HARMLESS])),
});
const without = (app) => Object.fromEntries(Object.entries(clean()).filter(([a]) => a !== app));

/** A stand-in for the client source, so a rename can be simulated without editing it. */
function clientSource(text) {
  const file = join(tempDir(), 'client.ts');
  writeFileSync(file, text);
  return file;
}

/** Runs the real CLI and returns its exit code, so the receipt is the process. */
function runChecker(args, checker = CHECKER) {
  try {
    execFileSync(process.execPath, [checker, ...args], { stdio: 'pipe' });
    return 0;
  } catch (error) {
    // Only an exit code is a verdict; a spawn failure must not pass as "the gate said no".
    if (typeof error.status !== 'number') throw error;
    return error.status;
  }
}

describe('bundles:check', () => {
  it('passes when only the shell carries the client', () => {
    const dir = fixture(clean());
    expect(problems(dir)).toEqual([]);
    expect(runChecker([dir])).toBe(0);
  });

  it.each(REMOTES)('fails when %s bundles the hand-written client', (remote) => {
    const dir = fixture({ ...clean(), [remote]: HARMLESS + MINIFIED_CLIENT });
    expect(problems(dir)).toEqual([expect.stringContaining(`${remote} bundles the identity client`)]);
    expect(runChecker([dir])).toBe(1);
  });

  it.each(Object.values(NEEDLES_BY_CLIENT).flat())('fails on the needle %s alone', (needle) => {
    const dir = fixture({ ...clean(), iam: `var s=${JSON.stringify(needle)};` });
    expect(problems(dir)).toHaveLength(1);
  });

  it('does not mistake the mock persona key for the client', () => {
    // 'atlas.auth' prefixes both storage keys, and every remote ships the mock's.
    expect(problems(fixture(clean()))).toEqual([]);
  });

  it('fails when a build is missing rather than passing an empty directory', () => {
    expect(problems(fixture(without('iam')))).toEqual([expect.stringContaining('iam:')]);
    expect(problems(fixture(without('shell')))).toEqual([expect.stringContaining('positive control')]);
  });

  describe('stale needles fail the gate, one at a time', () => {
    it('when the shell bundle no longer contains any of them', () => {
      const dir = fixture({ ...clean(), shell: 'var renamed=class{};' });
      expect(problems(dir)).toEqual([expect.stringContaining('needles no longer')]);
      expect(runChecker([dir])).toBe(1);
    });

    it.each(NEEDLES_BY_CLIENT.shell)('when the shell bundle loses only %s', (needle) => {
      const dir = fixture({ ...clean(), shell: MINIFIED_CLIENT.replace(needle, '/renamed/') });
      expect(problems(dir)).toEqual([expect.stringContaining(JSON.stringify([needle]))]);
    });

    it.each(NEEDLES_BY_CLIENT.shell)('when the client source loses only %s', (needle) => {
      const source = clientSource(MINIFIED_CLIENT.replace(needle, '/renamed/'));
      const dir = fixture(clean());
      expect(problems(dir, source)).toEqual([
        expect.stringContaining(`client source: ${source} does not contain ${JSON.stringify([needle])}`),
      ]);
      expect(runChecker([dir, source])).toBe(1);
    });

    it('when the client source has moved', () => {
      expect(problems(fixture(clean()), '/nonexistent/client.ts')).toEqual([
        expect.stringContaining('client source'),
      ]);
    });

    // The gate checks the real source on every run; this only makes a rename
    // fail in the unit suite as well, when this spec happens to run.
    it('accepts the real client source today', () => {
      expect(problems(fixture(clean()), CLIENT_SOURCE)).toEqual([]);
    });
  });

  it('still scans when invoked through a symlink', () => {
    // argv[1] keeps the link, import.meta.url resolves it; a naive main-module
    // check skips the scan and exits 0.
    const link = join(tempDir(), 'check-remote-bundles.mjs');
    symlinkSync(CHECKER, link);
    const dir = fixture({ ...clean(), iam: MINIFIED_CLIENT });
    expect(runChecker([dir], link)).toBe(1);
  });
});
