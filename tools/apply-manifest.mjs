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
const env = args.find((a) => !a.startsWith('--'));
const outIndex = args.indexOf('--out');
const out = outIndex === -1 ? DEFAULT_OUT : args[outIndex + 1];

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

// Verify rather than assume. A rebuild between build and upload would silently
// restore the committed localhost manifest, and the deploy would still look
// green while shipping a console whose remotes all point at localhost.
if (readFileSync(target, 'utf8') !== readFileSync(source, 'utf8')) {
  fail(`${target} does not match ${source} after the copy`);
}
console.log(`apply-manifest: ${env} -> ${target}`);
