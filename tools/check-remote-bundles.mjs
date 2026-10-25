/**
 * Last line of defence for ADR-0006's boundary: the identity client is
 * shell-only, and no remote may ship it.
 *
 * The eslint rule catches a direct import and the federation `skip` list stops
 * sharing, but neither can see what actually landed in a bundle — a transitive
 * path, or a refactor that moves the client into a shared lib, would only show
 * up here. Symptom if it regresses: two independent auth states that can
 * disagree about who is signed in. (Supabase's SDK announced this as "Multiple
 * GoTrueClient instances detected in the same browser context"; the
 * hand-written Nhost client prints no such warning, so a duplicate would go
 * unnoticed.)
 *
 * Usage: node tools/check-remote-bundles.mjs [distAppsDir] [clientSource]
 * Both default to this repo's; the arguments exist so the spec can run this
 * exact CLI against fixtures.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENT_SOURCE = join(ROOT, 'apps/shell/src/app/auth/nhost-identity.client.ts');
export const REMOTES = ['iam', 'feature-flags', 'audit-logs'];
/**
 * Keyed by client so adding one is an obvious edit rather than an easy omission.
 *
 * This list is the whole gate. It was ['GoTrueClient', '@supabase/'] — which
 * protected ADR-0006's boundary exactly as long as Supabase was the provider,
 * and would have gone on passing green the moment a remote bundled a different
 * identity client. A gate that only recognises the vendor you are leaving is
 * not a gate.
 *
 * `shell` is the client this repo actually ships (apps/shell/src/app/auth/
 * nhost-identity.client.ts). It is not an SDK, so the vendor needles cannot see
 * it; these are strings from its own source that survive minification — the
 * provider's sign-in path and the client's log prefix. Neither appears in any
 * remote today, and the client's source reserves the prefix so that nothing
 * else in a shared lib borrows it. (Its storage key is no usable needle: 'atlas.auth' is also the
 * prefix of the mock's 'atlas.auth.persona', which every remote ships.)
 *
 * The vendor entries stay although nothing depends on either SDK: they are the
 * regression check for the provider that was removed and the one someone would
 * reach for next, and a needle that never matches costs nothing.
 */
export const NEEDLES_BY_CLIENT = {
  shell: ['/signin/provider/', '[atlas-auth]'],
  supabase: ['GoTrueClient', '@supabase/'],
  nhost: ['@nhost/', 'nhost-js', 'hasura-auth'],
};
const NEEDLES = Object.values(NEEDLES_BY_CLIENT).flat();

function jsFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return /\.(m?js)$/.test(entry) ? [path] : [];
  });
}

/** The needles from `needles` that no file under `dir` contains. */
function missing(dir, needles) {
  const sources = jsFiles(dir).map((file) => readFileSync(file, 'utf8'));
  return needles.filter((needle) => !sources.some((source) => source.includes(needle)));
}

function matching(dir, needles) {
  return jsFiles(dir).filter((file) => {
    const source = readFileSync(file, 'utf8');
    return needles.some((needle) => source.includes(needle));
  });
}

/**
 * Returns one line per problem; empty means the boundary holds.
 *
 * Needles copied from source go stale silently: rename the endpoint or the log
 * prefix and every remote passes for the wrong reason — the gate is still
 * green, and now blind. So two positive controls run, and each needle must pass
 * both on its own; one stale needle is a failure, not a quieter gate.
 *
 * - The client's source must contain it. This is checked here, not only in the
 *   spec, because Nx cannot see the spec reading a shell file: `nx affected`
 *   skips it and the cache replays a pass after the client changes.
 * - The shell's bundle must contain it. The source check cannot prove the
 *   string survives minification; this does.
 */
export function problems(distApps, clientSource = CLIENT_SOURCE) {
  const found = [];
  for (const remote of REMOTES) {
    const dir = join(distApps, remote, 'browser');
    if (!existsSync(dir)) {
      found.push(`${remote}: ${dir} does not exist — build the remotes first`);
      continue;
    }
    for (const hit of matching(dir, NEEDLES)) {
      found.push(`${remote} bundles the identity client: ${relative(distApps, hit)}`);
    }
  }

  const source = existsSync(clientSource) ? readFileSync(clientSource, 'utf8') : '';
  const notInSource = NEEDLES_BY_CLIENT.shell.filter((needle) => !source.includes(needle));
  if (notInSource.length) {
    found.push(
      `client source: ${clientSource} does not contain ${JSON.stringify(notInSource)} — ` +
        'the needles no longer recognise the identity client. Update NEEDLES_BY_CLIENT.shell ' +
        '(or CLIENT_SOURCE, if the client moved).',
    );
  }

  const shell = join(distApps, 'shell', 'browser');
  if (!existsSync(shell)) {
    found.push(`shell: ${shell} does not exist — the positive control needs the shell build`);
  } else {
    const notInBundle = missing(shell, NEEDLES_BY_CLIENT.shell);
    if (notInBundle.length) {
      found.push(
        `shell: no file contains ${JSON.stringify(notInBundle)} — the needles no longer ` +
          'recognise the identity client, so a clean remote proves nothing. Update ' +
          'NEEDLES_BY_CLIENT.shell from the client source.',
      );
    }
  }
  return found;
}

/**
 * Compared by real path: invoked through a symlink (macOS's /tmp and /var are
 * both one), argv[1] keeps the link while import.meta.url resolves it, and a
 * plain comparison would skip the scan and exit 0 — a silent pass.
 */
const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) {
  const distApps = resolve(process.argv[2] ?? join(ROOT, 'dist/apps'));
  const found = problems(distApps, process.argv[3] ? resolve(process.argv[3]) : CLIENT_SOURCE);
  if (found.length) {
    for (const line of found) console.error(`✖ ${line}`);
    console.error('\nThe auth provider must stay shell-only (ADR-0006).');
    process.exit(1);
  }
  for (const remote of REMOTES) console.log(`✔ ${remote}: no identity client in the bundle`);
  console.log('✔ shell: the needles still recognise the identity client');
}
