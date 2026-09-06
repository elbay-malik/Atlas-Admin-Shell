import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * Proves the browser-to-BFF path, which the main federation suite deliberately
 * does not: that one runs with no backend at all so it keeps working without
 * one. Here the shell is served by `wrangler dev` running the DEV Worker entry,
 * which trusts the mock auth's fake token, and the e2e manifest sets
 * `apiMode: http` so the remotes call /api instead of their mocks.
 */
const preset = nxE2EPreset(import.meta.dirname, { testDir: './src' });

/**
 * Port 4300, not 4200: `nx affected -t e2e` runs this suite and the federation
 * suite in the same invocation, and they would otherwise fight over the port
 * and over building the same apps.
 */
const server = (app: string, target: string, url: string) => ({
  // must stay exactly `pnpm exec nx run <project>:<target>` — @nx/playwright
  // parses it to derive dependsOn
  command: `pnpm exec nx run ${app}:${target}`,
  url,
  reuseExistingServer: true,
  timeout: 300_000,
  cwd: workspaceRoot,
});

export default defineConfig({
  ...preset,
  // A cold `wrangler dev` start plus a federated remote load is materially
  // slower than the static-server suite, and the first navigation pays all of
  // it. The assertions are about content, not latency, so the budget reflects
  // the runtime rather than the default.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  // These share one Worker isolate holding real mutable state, so they must not
  // run concurrently: a flag write in one spec is visible to every other. Serial
  // execution is also what keeps a cold start from being paid five times over.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Only the shell: these drive the API boundary, not the federated UIs.
  webServer: [server('shell', 'serve-worker', 'http://localhost:4300')],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
