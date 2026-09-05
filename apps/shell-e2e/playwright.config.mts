import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

const isCI = !!process.env['CI'];
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';
const preset = nxE2EPreset(import.meta.dirname, { testDir: './src' });

/**
 * Locally the four Native Federation dev servers give hot reload; in CI we run
 * the suite against the PRODUCTION builds served statically, which is what
 * slice 3 actually deploys — and starts in about a second once Nx has the build
 * cached, instead of booting four Vite servers (ADR-0009).
 */
const serveTarget = isCI ? 'serve-static' : 'serve';

/**
 * The command string must stay exactly `pnpm exec nx run <project>:<target>`:
 * @nx/playwright parses it to derive `dependsOn`, so Nx (not each Playwright
 * worker) owns the servers. Any extra flag breaks the regex, and the atomized
 * e2e-ci tasks would then each boot their own copy.
 */
const server = (app: string, url: string) => ({
  command: `pnpm exec nx run ${app}:${serveTarget}`,
  url,
  reuseExistingServer: true,
  timeout: isCI ? 300_000 : 180_000,
  cwd: workspaceRoot,
});

/**
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...preset,
  // preset already sets retries/workers/forbidOnly from CI; add GitHub annotations
  reporter: isCI
    ? [...(preset.reporter as ReporterDescription[]), ['github']]
    : preset.reporter,
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    server('shell', 'http://localhost:4200'),
    server('iam', 'http://localhost:4201/remoteEntry.json'),
    server('feature-flags', 'http://localhost:4202/remoteEntry.json'),
    server('audit-logs', 'http://localhost:4203/remoteEntry.json'),
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
