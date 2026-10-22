/**
 * Validates every environment manifest against the shared contract, so a typo
 * in a deploy artifact fails CI instead of silently booting the console with no
 * remotes. Cheap enough to run without building anything.
 *
 * `problems()` is exported so manifest-validator-parity.spec.mjs can hold it
 * against the
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
// this script exists to prevent. manifest-validator-parity.spec.mjs now enforces the
// implication over generated mutations instead of trusting a comment.
/**
 * Paths the SHELL owns. A remote claiming one of these does not fail — it wins,
 * and silently takes over a screen the shell is responsible for. `unavailable`
 * is the ADR-0007 error boundary: a remote mounted there would be asked to
 * render the page that explains why a remote could not be rendered.
 */
const SHELL_RESERVED_ROUTES = ['unavailable'];

/**
 * Recognises a Supabase service-role key in either format.
 *
 * New-style keys are distinguishable by prefix (`sb_secret_` vs
 * `sb_publishable_`). Legacy keys are both JWTs and look identical from the
 * outside — the role sits in the payload — so telling them apart means
 * decoding and looking.
 */
function looksLikeSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    // not a JWT we can read; the prefix check above is all we have
    return false;
  }
}

/** Segments of a route path, ignoring incidental slashes. */
const segments = (route) => route.split('/').filter(Boolean);

/**
 * True when `a` owns everything under it that `b` would need.
 *
 * buildRoutes gives each remote `{ path: def.route, loadChildren }`, and Angular
 * matches by segment prefix, so a remote at `iam` swallows `iam/users` — the
 * second remote is unreachable even for a user allowed to enter it. Equal paths
 * are the degenerate case of the same problem.
 */
function shadows(a, b) {
  const [x, y] = [segments(a), segments(b)];
  return x.length <= y.length && x.every((segment, i) => segment === y[i]);
}

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
  // The auth block ships to the browser, so the deployment question is not "is
  // it well-formed" — the contract guard answers that — but "is it safe to
  // publish, and will it work over the wire".
  if (manifest.auth !== undefined) {
    const auth = manifest.auth;
    if (typeof auth !== 'object' || auth === null) {
      found.push('auth must be an object');
    } else {
      if (typeof auth.url !== 'string' || !auth.url.startsWith('https://')) {
        found.push(`auth.url must be an https:// URL, got ${JSON.stringify(auth.url)}`);
      }
      if (typeof auth.publishableKey !== 'string' || auth.publishableKey.length === 0) {
        found.push('auth.publishableKey must be a non-empty string');
      } else if (looksLikeSecretKey(auth.publishableKey)) {
        // The one mistake here is unrecoverable. A service-role key grants full
        // database access and bypasses row-level security, and this file is
        // served to every visitor — rotation is the only remedy afterwards, so
        // the gate refuses rather than warns.
        found.push('auth.publishableKey looks like a SERVICE-ROLE secret — it would be published to every visitor');
      }
    }
  }
  if (typeof manifest.remotes !== 'object' || manifest.remotes === null) {
    return [...found, 'remotes must be an object'];
  }
  // The headline failure this script exists to prevent, and the one it used to
  // wave through: `remotes: {}` satisfies the runtime contract, so the console
  // boots, renders its chrome, and offers nothing. "✔ 0 remotes" is not a pass.
  if (Object.keys(manifest.remotes).length === 0) {
    found.push('remotes is empty — the console would boot with no domains at all');
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

    // Angular validates route config at router creation and THROWS on a leading
    // slash (RuntimeError 4014, "path cannot start with a slash"), so this does
    // not degrade to zero remotes — it takes the whole shell down before first
    // paint. Strictly worse than the failure the rest of this file guards.
    if (typeof def.route === 'string' && def.route.startsWith('/')) {
      found.push(`${name}.route must not start with "/" — Angular refuses the route config and the shell will not boot`);
    }
    if (typeof def.route === 'string' && SHELL_RESERVED_ROUTES.includes(def.route)) {
      found.push(`${name}.route "${def.route}" is reserved by the shell`);
    }
  }

  // Cross-remote: routes must not shadow one another.
  const routed = Object.entries(manifest.remotes).filter(
    ([, def]) => typeof def === 'object' && def !== null && typeof def.route === 'string' && def.route
  );
  for (const [name, def] of routed) {
    for (const [other, otherDef] of routed) {
      if (name === other) continue;
      if (!shadows(otherDef.route, def.route)) continue;
      found.push(
        otherDef.route === def.route
          ? `${name}.route "${def.route}" is also used by ${other} — the first one wins and ${name} is unreachable`
          : `${name}.route "${def.route}" is shadowed by ${other}.route "${otherDef.route}"`
      );
      break;
    }
  }

  return found;
}

/**
 * `--require <env>` additionally asserts that ONE named environment exists and
 * passes. The deploy workflow uses it as a pre-flight: without it, selecting an
 * environment that has no manifest published the three remotes and only THEN
 * failed on the shell, leaving the platform half-deployed. Validating every
 * manifest that happens to exist does not answer "can this deploy proceed".
 */
function requiredEnv(argv) {
  const index = argv.indexOf('--require');
  return index === -1 ? null : argv[index + 1];
}

/** The CLI. Split out so importing this module for the parity test runs nothing. */
function main() {
  const required = requiredEnv(process.argv.slice(2));
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

    if (required !== null) {
    if (!required) {
      console.error('check-manifests: --require needs an environment name');
      failed = true;
    } else if (!envs.includes(required)) {
      console.error(
        `\u2716 required environment "${required}" has no manifest. Available: ${envs.join(', ')}`
      );
      console.error('    nothing was deployed. Add deploy/manifests/' + required + '/ first.');
      failed = true;
    } else {
      console.log(`\u2714 required environment "${required}" is present`);
    }
  }

  process.exit(failed ? 1 : 0);
}

// Only when run as `node tools/check-manifests.mjs`, never on import.
if (import.meta.main) main();
