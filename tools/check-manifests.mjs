/**
 * Validates every environment manifest against the shared contract, so a typo
 * in a deploy artifact fails CI instead of silently booting the console with no
 * remotes. Cheap enough to run without building anything.
 *
 * `problems()` is exported so check-manifests.spec.mjs can hold it against the
 * real `isAtlasManifest`. That parity test is the point: this file duplicates
 * the guard, and a duplicate that is only ASSERTED to stay in step will not.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Anchored to the repo, not the caller's cwd — the deploy target runs inside apps/<app>. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DIR = join(ROOT, 'deploy/manifests');
const MANIFEST = 'federation.manifest.json';

/** Path of an absolute URL, or null if it will not parse. */
function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

// Mirrors isAtlasManifest from @atlas/shared-contracts, plus deployment-only
// rules the runtime guard has no reason to enforce. Duplicated deliberately:
// this script must run before, and without, a TypeScript build.
//
// The duplication is safe in one direction only: this validator must be
// strictly STRICTER than isAtlasManifest, so a manifest that passes CI always
// satisfies the shell at runtime. libs/shared/contracts remains the source of
// truth for the shape itself.
//
// That direction used to be checked by hand, and it rotted the first time the
// contract grew: `apiMode` was added to AtlasManifest with the edge BFF and
// never added here, so a manifest with a typo'd mode passed CI, failed the
// runtime guard, and booted the console with ZERO remotes — the exact outcome
// this script exists to prevent. check-manifests.spec.mjs now enforces the
// implication over generated mutations instead of trusting a comment.
export function problems(manifest) {
  const found = [];
  if (typeof manifest !== 'object' || manifest === null) return ['not an object'];
  if (manifest.version !== 1) found.push(`version must be 1, got ${JSON.stringify(manifest.version)}`);
  // Optional, but a WRONG value is fatal: isAtlasManifest rejects the whole
  // manifest over it, and the shell then degrades to zero remotes.
  if (
    manifest.apiMode !== undefined &&
    manifest.apiMode !== 'mock' &&
    manifest.apiMode !== 'http'
  ) {
    found.push(`apiMode must be 'mock' or 'http' when present, got ${JSON.stringify(manifest.apiMode)}`);
  }
  if (typeof manifest.remotes !== 'object' || manifest.remotes === null) {
    return [...found, 'remotes must be an object'];
  }
  for (const [name, def] of Object.entries(manifest.remotes)) {
    if (typeof def !== 'object' || def === null) {
      found.push(`${name}: entry is not an object`);
      continue;
    }
    for (const field of ['url', 'displayName', 'route', 'icon', 'exposedModule']) {
      if (typeof def[field] !== 'string' || def[field].length === 0) {
        found.push(`${name}.${field} must be a non-empty string`);
      }
    }
    if (def.requiredRole !== 'admin' && def.requiredRole !== 'viewer') {
      found.push(`${name}.requiredRole must be 'admin' or 'viewer'`);
    }
    // The federation runtime derives a remote's import-map scope from the entry
    // URL's DIRECTORY, so a URL that is only an origin (or a bare directory)
    // would scope the entire host and collide with every other remote there.
    // The real invariant is therefore "points at an entry file", not a specific
    // filename — Native Federation's default is remoteEntry.json, but the name
    // is configurable and a valid deployment may use another.
    if (typeof def.url === 'string' && def.url.length > 0) {
      const path = def.url.startsWith('/') ? def.url : safePath(def.url);
      const file = path?.split('/').pop() ?? '';
      if (!file.endsWith('.json')) {
        found.push(`${name}.url must point at a remote entry .json file, got ${def.url}`);
      }
    }
  }
  return found;
}

/** The CLI. Split out so importing this module for the parity test runs nothing. */
function main() {
  if (!existsSync(ENV_DIR)) {
    console.error(`check-manifests: ${ENV_DIR} does not exist`);
    process.exit(1);
  }

  let failed = false;
  // directories only — this folder also holds a README
  const envs = readdirSync(ENV_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (envs.length === 0) {
    console.error('check-manifests: no environments found');
    process.exit(1);
  }

  for (const env of envs) {
    const path = join(ENV_DIR, env, MANIFEST);
    if (!existsSync(path)) {
      console.error(`✖ ${env}: missing ${MANIFEST}`);
      failed = true;
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      console.error(`✖ ${env}: invalid JSON — ${error.message}`);
      failed = true;
      continue;
    }
    const found = problems(parsed);
    if (found.length) {
      console.error(`✖ ${env}:`);
      for (const p of found) console.error(`    ${p}`);
      failed = true;
    } else {
      console.log(`✔ ${env}: ${Object.keys(parsed.remotes).length} remotes`);
    }
  }

  process.exit(failed ? 1 : 0);
}

// Only when run as `node tools/check-manifests.mjs`, never on import.
if (import.meta.main) main();
