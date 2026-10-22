/**
 * Runs the CI pipeline locally, gate for gate.
 *
 * This exists because GitHub-hosted Actions minutes are metered on private
 * repositories, and this one exhausted its allowance. The gates themselves are
 * not the problem — they are the point of the repo — so they moved here rather
 * than being weakened.
 *
 * Two deliberate differences from .github/workflows/ci.yml:
 *
 *  - It runs `run-many`, not `affected`. CI uses `affected` to stay inside a
 *    time budget; locally the only cost is wall-clock, and running everything
 *    removes a whole class of "the gate was never scheduled" failure that this
 *    repository has now produced three times (ADR-0008, ADR-0009).
 *  - It keeps going after a failure and reports every gate at the end, because
 *    the useful answer is "which of these are broken", not "the first one".
 *
 * Usage:
 *   node tools/ci-local.mjs            every gate, including e2e and Lighthouse
 *   node tools/ci-local.mjs --quick    skips the browser-driven gates
 *   node tools/ci-local.mjs --list     prints the gates without running them
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const LIST = args.includes('--list');

/**
 * `slow` gates drive a real browser or boot servers. They are the ones that
 * catch what unit tests structurally cannot — federation across origins, axe on
 * rendered output — so --quick is a convenience, never the thing to trust
 * before a merge.
 */
const GATES = [
  {
    name: 'zoneless guard',
    why: 'zone.js must never resolve into the tree (ADR-0003)',
    run: () => {
      if (existsSync('node_modules/zone.js')) throw new Error('node_modules/zone.js exists');
      const tree = execSync('pnpm ls --depth Infinity zone.js 2>/dev/null || true', { encoding: 'utf8' });
      if (/\bzone\.js\b/.test(tree)) throw new Error('zone.js resolved into the dependency tree');
    },
  },
  { name: 'manifest:check', why: 'every environment manifest satisfies the contract', cmd: 'pnpm run manifest:check' },
  { name: 'tokens:check', why: 'committed CSS still matches tokens/*.json', cmd: 'pnpm run tokens:check' },
  { name: 'lint', why: 'module boundaries and code rules', cmd: 'pnpm exec nx run-many -t lint' },
  { name: 'typecheck', why: 'the Worker is bundled by esbuild, which does not type-check it', cmd: 'pnpm exec nx run-many -t typecheck' },
  { name: 'test', why: 'every unit and contract suite', cmd: 'pnpm exec nx run-many -t test' },
  { name: 'build', why: 'all four apps plus the buildable libs', cmd: 'pnpm exec nx run-many -t build' },
  { name: 'build-storybook', why: 'the a11y gate needs a built workbench', cmd: 'pnpm exec nx run-many -t build-storybook' },
  { name: 'deploy -c check', why: 'every wrangler config against its asset dir, no credentials', cmd: 'pnpm exec nx run-many -t deploy -c check' },
  { name: 'bundles:check', why: 'no remote may bundle the identity client (ADR-0006)', cmd: 'pnpm run bundles:check' },
  { name: 'test-storybook', why: 'axe on every story', cmd: 'pnpm exec nx run shared-ui:test-storybook', slow: true },
  { name: 'e2e: federation', why: 'production builds over real import maps (ADR-0009)', cmd: 'pnpm exec nx run shell-e2e:e2e', slow: true, env: { CI: 'true' } },
  { name: 'e2e: edge BFF', why: 'the real Worker over HTTP via wrangler dev', cmd: 'pnpm exec nx run shell-bff-e2e:e2e', slow: true },
  { name: 'lighthouse', why: 'shell and a federated route, median of 3 (ADR-0012)', cmd: 'pnpm exec nx run shell:lighthouse', slow: true },
];

const selected = GATES.filter((gate) => !(QUICK && gate.slow));

if (LIST) {
  for (const gate of GATES) {
    console.log(`${gate.slow ? 'slow' : '    '}  ${gate.name.padEnd(18)} ${gate.why}`);
  }
  process.exit(0);
}

/** Caps, not budgets. Anything near these is hung, not slow. */
const FAST_GATE_TIMEOUT_MS = 5 * 60_000;
const SLOW_GATE_TIMEOUT_MS = 12 * 60_000;

const seconds = (ms) => `${(ms / 1000).toFixed(0)}s`;
const results = [];

console.log(`\nci-local: ${selected.length} gates${QUICK ? ' (--quick: browser gates skipped)' : ''}\n`);

for (const gate of selected) {
  const started = process.hrtime.bigint();
  process.stdout.write(`  ${gate.name.padEnd(18)} `);
  let failure = null;
  try {
    if (gate.run) gate.run();
    else
      execSync(gate.cmd, {
        stdio: 'pipe',
        env: { ...process.env, ...(gate.env ?? {}) },
        // A hung gate is worse than a failing one: it reports nothing, and the
        // failure it is hiding stays hidden. The browser gates boot servers and
        // drive Chrome, so the cap is generous — it exists to turn "forever"
        // into a result, not to police how long a gate may legitimately take.
        timeout: gate.slow ? SLOW_GATE_TIMEOUT_MS : FAST_GATE_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
  } catch (error) {
    // keep the tail: nx and playwright put the actionable part at the end
    const output = [error.stdout, error.stderr].filter(Boolean).map(String).join('\n');
    const tail = output.split('\n').filter((l) => l.trim()).slice(-25).join('\n');
    failure =
      error.signal === 'SIGKILL'
        ? `TIMED OUT — killed after the cap. This gate hung rather than failed, so the output ` +
          `below is where it stopped, not why:\n${tail}`
        : tail || String(error.message);
  }
  const took = seconds(Number(process.hrtime.bigint() - started) / 1e6);
  console.log(failure ? `FAIL  ${took}` : `ok    ${took}`);
  results.push({ ...gate, failure, took });
}

const failed = results.filter((r) => r.failure);

console.log('\n' + '-'.repeat(72));
for (const r of results) console.log(`  ${r.failure ? 'FAIL' : 'ok  '}  ${r.name.padEnd(18)} ${r.took.padStart(5)}  ${r.why}`);
console.log('-'.repeat(72));

if (failed.length) {
  for (const r of failed) {
    console.log(`\n### ${r.name} — last lines\n`);
    console.log(r.failure);
  }
  console.log(`\nci-local: ${failed.length} of ${results.length} gates FAILED\n`);
  process.exit(1);
}

console.log(
  `\nci-local: all ${results.length} gates passed` +
    (QUICK ? ' — browser gates were skipped, do not merge on this alone\n' : '\n')
);
