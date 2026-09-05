import { describe, expect, it } from 'vitest';

// Injected by vitest.config.mts, which reads both files. The Worker sandbox has
// no filesystem, and importing across the project boundary is (rightly) refused
// by @nx/enforce-module-boundaries.
declare const __SHELL_WRANGLER__: string;
declare const __TEST_WRANGLER__: string;

/**
 * The tests run against wrangler.test.jsonc, but production behaviour is decided
 * by apps/shell/wrangler.jsonc — which no test loads. Without this, a changed
 * compatibility_date, a dropped run_worker_first entry or a switched
 * not_found_handling would leave every test green while changing what deploys.
 *
 * This does not make the duplication go away; it makes it loud.
 */
function readJsonc(source: string): Record<string, unknown> {
  // Strip // line comments that are not inside a string literal.
  let stripped = '';
  let inString = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (char === '\\') {
        stripped += char + (source[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (char === '"') inString = false;
      stripped += char;
      continue;
    }
    if (char === '"') {
      inString = true;
      stripped += char;
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      stripped += '\n';
      continue;
    }
    stripped += char;
  }
  return JSON.parse(stripped) as Record<string, unknown>;
}

const shell = readJsonc(__SHELL_WRANGLER__);
const test = readJsonc(__TEST_WRANGLER__);
const assetsOf = (config: Record<string, unknown>) =>
  config['assets'] as Record<string, unknown>;

describe('the test config mirrors what actually deploys', () => {
  it('pins the same compatibility date, which decides routing behaviour', () => {
    expect(test['compatibility_date']).toBe(shell['compatibility_date']);
  });

  it('scopes the Worker to the same paths', () => {
    expect(assetsOf(test)['run_worker_first']).toEqual(assetsOf(shell)['run_worker_first']);
  });

  it('uses the same not_found_handling, so the SPA-fallback trap is reproduced', () => {
    expect(assetsOf(test)['not_found_handling']).toBe(assetsOf(shell)['not_found_handling']);
  });

  it('binds the assets under the same name the Worker code uses', () => {
    expect(assetsOf(test)['binding']).toBe(assetsOf(shell)['binding']);
    expect(assetsOf(test)['binding']).toBe('ASSETS');
  });

  it('declares every var the Worker reads from env', () => {
    const shellVars = Object.keys((shell['vars'] ?? {}) as object).sort();
    const testVars = Object.keys((test['vars'] ?? {}) as object).sort();
    expect(testVars).toEqual(shellVars);
  });

  it('points the deployed config at this Worker source', () => {
    expect(shell['main']).toBe('../shell-bff/src/worker.ts');
  });
});
