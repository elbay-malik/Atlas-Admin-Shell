/**
 * Runs Lighthouse against the running console and checks it against
 * tools/lighthouse/budget.mjs.
 *
 * Why this rather than @lhci/cli (ADR-0012): that wrapper has not shipped since
 * June 2025, pins a superseded Lighthouse, and its own CI only tests Node 18
 * while this workspace runs 24. Driving Lighthouse directly is about 150 lines,
 * keeps the dependency current, and lets the aggregation be median by
 * construction — LHCI defaults to 'optimistic', where more runs make the gate
 * LOOSER because a single lucky run satisfies it.
 *
 * Usage: node tools/lighthouse/run.mjs [--runs 3] [--base http://localhost:4200]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { CATEGORIES, ERRORS, ROUTES, WARNINGS } from './budget.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const BASE = option('base', 'http://localhost:4200').replace(/\/$/, '');
const RUNS = Number(option('runs', '3'));
const OUT = option('out', 'dist/lighthouse');

/** Median, not mean: one slow run on a shared runner should not move the verdict. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Seeds the persona so Lighthouse's own navigation is signed in.
 *
 * This MUST run in the same browser context Lighthouse drives. An isolated page
 * (Playwright's browser.newPage() opens its own context) gets its own
 * localStorage, so the seed never reaches the measured navigation — the run then
 * redirects to the overview and reports a healthy score for the wrong page.
 * That happened, and it is why verifyMeasured() below exists.
 */
async function prepare(context, route) {
  if (!route.persona) return;
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      (persona) => localStorage.setItem('atlas.auth.persona', persona),
      route.persona
    );
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(route.ready, { timeout: 30_000 });
  } finally {
    await page.close();
  }
}

/**
 * Refuses to report a number for a page we did not actually measure.
 *
 * A performance gate that silently measures the wrong page is worse than no
 * gate: it is green forever and reads as evidence. So every run must land on
 * the URL it asked for, and a route declared federated must actually have
 * pulled a remote's chunks rather than only probing its remoteEntry.
 */
function verifyMeasured(route, lhr) {
  const requested = `${BASE}${route.path}`;
  const landed = lhr.finalDisplayedUrl ?? lhr.finalUrl;
  if (landed?.replace(/\/$/, '') !== requested.replace(/\/$/, '')) {
    throw new Error(
      `${route.path}: measured ${landed} instead — the persona seed did not apply, ` +
        'so this would have scored the overview.'
    );
  }
  if (!route.persona) return;

  const items = lhr.audits?.['network-requests']?.details?.items ?? [];
  const remoteChunks = items.filter(
    (item) => /:(4201|4202|4203)\//.test(item.url ?? '') && !/remoteEntry\.json/.test(item.url ?? '')
  );
  if (remoteChunks.length === 0) {
    throw new Error(
      `${route.path}: no remote chunks were fetched, only remoteEntry probes — ` +
        'this measured the shell alone, not the federated route.'
    );
  }
}

async function measure(context, port, route) {
  const runs = [];
  for (let attempt = 0; attempt < RUNS; attempt += 1) {
    await prepare(context, route);
    // Signature is (url, flags, config, page). The desktop settings belong in
    // CONFIG — passing them fourth makes Lighthouse treat them as a Puppeteer
    // page and fail inside its driver.
    const result = await lighthouse(
      `${BASE}${route.path}`,
      { port, output: 'json', logLevel: 'error' },
      {
        extends: 'lighthouse:default',
        // Desktop: this is an internal admin console. Scoring it on an emulated
        // low-end phone measures a device class the product does not target,
        // and desktop's curve is the tighter one (LCP p10 1200ms vs 2500ms).
        settings: {
          formFactor: 'desktop',
          screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
          throttling: { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 },
        },
      }
    );
    if (result?.lhr) {
      verifyMeasured(route, result.lhr);
      runs.push(result.lhr);
    }
  }
  if (runs.length === 0) throw new Error(`Lighthouse produced no report for ${route.path}`);
  return runs;
}

const numericOf = (lhr, id) => lhr.audits?.[id]?.numericValue;
const scoreOf = (lhr, id) => lhr.audits?.[id]?.score;

function check(routeName, runs) {
  const failures = [];
  const warnings = [];
  const rows = [];

  for (const [id, budget] of Object.entries(ERRORS)) {
    if (budget.max !== undefined) {
      const values = runs.map((r) => numericOf(r, id)).filter((v) => typeof v === 'number');
      if (values.length === 0) {
        // Never silently pass an audit that produced nothing — that is exactly
        // how a gate rots into decoration.
        failures.push(`${routeName} — ${budget.label}: audit produced no value`);
        continue;
      }
      const value = median(values);
      rows.push({ route: routeName, metric: budget.label, value: value.toFixed(3), budget: budget.max });
      if (value > budget.max) {
        failures.push(`${routeName} — ${budget.label}: ${value.toFixed(3)} exceeds ${budget.max}`);
      }
    }
    if (budget.minScore !== undefined) {
      const values = runs.map((r) => scoreOf(r, id)).filter((v) => typeof v === 'number');
      if (values.length === 0) {
        failures.push(`${routeName} — ${budget.label}: audit produced no score`);
        continue;
      }
      const value = median(values);
      rows.push({ route: routeName, metric: budget.label, value, budget: budget.minScore });
      if (value < budget.minScore) {
        failures.push(`${routeName} — ${budget.label}: ${value} below ${budget.minScore}`);
      }
    }
  }

  for (const [id, budget] of Object.entries(WARNINGS)) {
    const values = runs.map((r) => numericOf(r, id)).filter((v) => typeof v === 'number');
    if (values.length === 0) continue;
    const value = median(values);
    rows.push({ route: routeName, metric: budget.label, value: Math.round(value), budget: budget.max });
    if (value > budget.max) {
      warnings.push(`${routeName} — ${budget.label}: ${Math.round(value)}ms over ${budget.max}ms`);
    }
  }

  for (const [id, budget] of Object.entries(CATEGORIES)) {
    const values = runs.map((r) => r.categories?.[id]?.score).filter((v) => typeof v === 'number');
    if (values.length === 0) continue;
    const value = median(values);
    rows.push({ route: routeName, metric: `category: ${id}`, value: value.toFixed(2), budget: budget.minScore });
    if (value < budget.minScore) {
      const message = `${routeName} — ${id}: ${value.toFixed(2)} below ${budget.minScore}`;
      (budget.level === 'error' ? failures : warnings).push(message);
    }
  }

  return { failures, warnings, rows };
}

// A PERSISTENT context, so the seeding page and Lighthouse's navigation share
// one storage partition. Lighthouse's default clearStorageTypes does not include
// local_storage, so the persona survives while the HTTP cache is still cleared
// before each run — cold-cache numbers on a signed-in page.
const port = 9222;
const profile = join(tmpdir(), `atlas-lighthouse-${process.pid}`);
const context = await chromium.launchPersistentContext(profile, {
  args: [`--remote-debugging-port=${port}`, '--no-sandbox'],
});
mkdirSync(OUT, { recursive: true });

const allFailures = [];
const allWarnings = [];
const allRows = [];

try {
  for (const route of ROUTES) {
    const runs = await measure(context, port, route);
    const { failures, warnings, rows } = check(route.name, runs);
    allFailures.push(...failures);
    allWarnings.push(...warnings);
    allRows.push(...rows);

    // Keep the median run's full report so a regression can be investigated
    // rather than merely noticed.
    const byScore = [...runs].sort(
      (a, b) => (a.categories?.performance?.score ?? 0) - (b.categories?.performance?.score ?? 0)
    );
    const representative = byScore[Math.floor(byScore.length / 2)];
    const slug = route.path === '/' ? 'root' : route.path.replace(/\//g, '-').replace(/^-/, '');
    writeFileSync(join(OUT, `${slug}.report.json`), JSON.stringify(representative, null, 2));
  }
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

console.log(`\nLighthouse — median of ${RUNS} runs, desktop\n`);
for (const row of allRows) {
  console.log(`  ${row.route.padEnd(38)} ${String(row.metric).padEnd(26)} ${String(row.value).padStart(9)}  (budget ${row.budget})`);
}

if (allWarnings.length) {
  console.log('\nOver budget (warning):');
  for (const warning of allWarnings) console.log(`  ! ${warning}`);
}

if (allFailures.length) {
  console.error('\nOver budget (failing):');
  for (const failure of allFailures) console.error(`  x ${failure}`);
  console.error(`\nReports written to ${OUT}`);
  process.exit(1);
}

console.log(`\nWithin budget. Reports written to ${OUT}\n`);
