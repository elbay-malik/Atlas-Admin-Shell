import { readFileSync } from 'node:fs';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

/**
 * The deployed routing behaviour is decided by apps/shell/wrangler.jsonc, which
 * the tests do not otherwise see. Both configs are read here and injected, so
 * config-parity.spec.ts can compare them without importing across a project
 * boundary (which @nx/enforce-module-boundaries rightly refuses).
 */
const read = (path: string) => JSON.stringify(readFileSync(new URL(path, import.meta.url), 'utf8'));

// Runs the Worker inside real workerd with the real wrangler config, so the
// tests exercise workerd's Request/Response semantics, the ASSETS binding and
// run_worker_first routing — not a Node approximation of them.
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/shell-bff',
  plugins: [nxViteTsPaths(), cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' } })],
  define: {
    __SHELL_WRANGLER__: read('../shell/wrangler.jsonc'),
    __TEST_WRANGLER__: read('./wrangler.test.jsonc'),
  },
  test: {
    name: 'shell-bff',
    watch: false,
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
