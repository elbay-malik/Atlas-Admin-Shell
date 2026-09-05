/**
 * Last line of defence for ADR-0006's boundary: the identity client is
 * shell-only, and no remote may ship it.
 *
 * The eslint rule catches a direct import and the federation `skip` list stops
 * sharing, but neither can see what actually landed in a bundle — a transitive
 * path, or a future refactor that moves the provider into a shared lib, would
 * only show up here. Symptom if it regresses: "Multiple GoTrueClient instances
 * detected in the same browser context", and two independent auth states.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REMOTES = ['iam', 'feature-flags', 'audit-logs'];
const NEEDLES = ['GoTrueClient', '@supabase/'];

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
