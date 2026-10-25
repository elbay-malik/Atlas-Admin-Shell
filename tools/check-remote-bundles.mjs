/**
 * Last line of defence for ADR-0006's boundary: the identity client is
 * shell-only, and no remote may ship it.
 *
 * The eslint rule catches a direct import and the federation `skip` list stops
 * sharing, but neither can see what actually landed in a bundle — a transitive
 * path, or a refactor that moves an SDK-based provider into a shared lib, would
 * only show up here. Symptom if it regresses: two independent auth states
 * that can disagree about who is signed in. (Supabase's SDK announced this as
 * "Multiple GoTrueClient instances detected in the same browser context"; the
 * hand-written Nhost client prints no such warning, so a duplicate would go
 * unnoticed.)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REMOTES = ['iam', 'feature-flags', 'audit-logs'];
/**
 * Keyed by vendor so adding one is an obvious edit rather than an easy omission.
 *
 * This list is the whole gate. It was ['GoTrueClient', '@supabase/'] — which
 * protected ADR-0006's boundary exactly as long as Supabase was the provider,
 * and would have gone on passing green the moment a remote bundled a different
 * identity client. A gate that only recognises the vendor you are leaving is
 * not a gate.
 *
 * The supabase entry stays although nothing in the repo depends on Supabase any
 * more: it is the regression check for the provider that was removed, and a
 * needle that never matches costs nothing. The current provider is not an SDK,
 * so these needles cannot see it. While it lives in apps/shell, a remote can
 * only reach it by importing an app project, which eslint refuses. If it were
 * moved into a shared lib, it would get past both: no needle matches its
 * source, and scope:shared's ban list names only the two SDKs. That is a limit
 * of this check, not a second layer. (Its storage key is no usable needle:
 * 'atlas.auth' is also the prefix of the mock's 'atlas.auth.persona'.)
 */
const NEEDLES_BY_VENDOR = {
  supabase: ['GoTrueClient', '@supabase/'],
  nhost: ['@nhost/', 'nhost-js', 'hasura-auth'],
};
const NEEDLES = Object.values(NEEDLES_BY_VENDOR).flat();

function jsFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return /\.(m?js)$/.test(entry) ? [path] : [];
  });
}

let failed = false;
for (const remote of REMOTES) {
  const dir = join(ROOT, 'dist/apps', remote, 'browser');
  if (!existsSync(dir)) {
    console.error(`✖ ${remote}: ${dir} does not exist — build the remotes first`);
    failed = true;
    continue;
  }
  const hits = jsFiles(dir).filter((file) => {
    const source = readFileSync(file, 'utf8');
    return NEEDLES.some((needle) => source.includes(needle));
  });
  if (hits.length) {
    console.error(`✖ ${remote} bundles the identity client:`);
    for (const hit of hits) console.error(`    ${hit.replace(ROOT + '/', '')}`);
    failed = true;
  } else {
    console.log(`✔ ${remote}: no identity client in the bundle`);
  }
}

if (failed) {
  console.error('\nThe auth provider must stay shell-only (ADR-0006).');
  process.exit(1);
}
