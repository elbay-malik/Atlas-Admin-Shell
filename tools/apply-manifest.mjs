/**
 * Copies an environment's federation manifest over the built shell.
 *
 * This runs at DEPLOY time, never inside `nx build shell`. That is the whole
 * point of ADR-0010: if the environment were a build input it would land in the
 * Nx cache key, every environment would get its own artifact, and repointing a
 * remote would mean rebuilding and redeploying the shell — which is exactly the
 * property ADR-0004 promises we do not have.
 *
 * Usage: node tools/apply-manifest.mjs <environment> [--out <dir>]
 */
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = 'federation.manifest.json';
/** Anchored to the repo, not the caller's cwd — the deploy target runs inside apps/<app>. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DIR = join(ROOT, 'deploy/manifests');
const DEFAULT_OUT = join(ROOT, 'dist/apps/shell/browser');

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex === -1 ? DEFAULT_OUT : args[outIndex + 1];
// The value after `--out` belongs to it. Scanning for "the first argument that
// does not start with --" used to swallow that value as the environment name,
// so `apply-manifest --out dist production` deployed an environment called
// "dist" — argument ORDER silently decided what shipped.
//
// `outIndex === -1` has to be handled explicitly: without it, the "value after
// --out" is index 0, which excludes the FIRST positional whenever --out is
// absent. That is the form the deploy target itself uses, so the plain
// `apply-manifest.mjs production` broke while every test — all of which pass
// --out — stayed green.
const valueOfOut = outIndex === -1 ? -1 : outIndex + 1;
const env = args.find((a, i) => !a.startsWith('--') && i !== valueOfOut);

function fail(message) {
  console.error(`apply-manifest: ${message}`);
  process.exit(1);
}

const available = existsSync(ENV_DIR)
  ? readdirSync(ENV_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];
if (!env) fail(`an environment is required. Available: ${available.join(', ') || '(none)'}`);

const source = join(ENV_DIR, env, MANIFEST);
if (!existsSync(source)) {
  fail(`no manifest for "${env}" at ${source}. Available: ${available.join(', ') || '(none)'}`);
}
if (outIndex !== -1 && !out) fail('--out needs a directory');
if (!existsSync(out)) fail(`build output ${out} does not exist — build the shell first`);

// Parse before copying: shipping a manifest the shell cannot read degrades the
// console to zero remotes, and that must never be discovered in production.
try {
  JSON.parse(readFileSync(source, 'utf8'));
} catch (error) {
  fail(`${source} is not valid JSON — ${error.message}`);
}

const target = join(out, MANIFEST);
copyFileSync(source, target);

// Reads the file back to catch a copy that did not land intact — a truncated
// write, a full disk, a target that is not writable the way we assumed.
//
// What it does NOT catch, despite how it was once described: a rebuild that
// clobbers the manifest LATER, between here and the upload. This runs
// microseconds after the copy and cannot observe a future event. The thing that
// actually prevents that failure is structural — the copy happens INSIDE the
// deploy target, after `dependsOn: ["build"]` has already run, so nothing
// rebuilds between this line and `wrangler deploy`. Keeping the two straight
// matters: a check credited with a guarantee it cannot provide is how the
// guarantee stops being maintained.
if (readFileSync(target, 'utf8') !== readFileSync(source, 'utf8')) {
  fail(`${target} does not match ${source} after the copy`);
}
console.log(`apply-manifest: ${env} -> ${target}`);
