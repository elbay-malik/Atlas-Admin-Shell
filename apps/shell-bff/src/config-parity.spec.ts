import { describe, expect, it } from 'vitest';

// Injected by vitest.config.mts, which reads both files. The Worker sandbox has
// no filesystem, and importing across the project boundary is (rightly) refused
// by @nx/enforce-module-boundaries.
declare const __SHELL_WRANGLER__: string;
declare const __TEST_WRANGLER__: string;

/**
 * The tests run against wrangler.test.jsonc, but production behaviour is decided
 * by apps/shell/wrangler.jsonc — which no test loads. Without this, a changed
 * compatibility_date, a changed run_worker_first entry or a switched
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

  /**
   * While the production manifest's apiMode is "mock" the shell deploys
   * assets-only: neither key is set and no request runs Worker code. When it
   * switches to "http" both come back together, and this test then holds the
   * deployed scope to the tested one.
   */
  it('deploys assets-only, or scopes the Worker to the same paths', () => {
    const shellScope = assetsOf(shell)['run_worker_first'];
    if (shell['main'] === undefined) {
      expect(shellScope).toBeUndefined();
      return;
    }
    expect(assetsOf(test)['run_worker_first']).toEqual(shellScope);
  });

  it('sets the Worker entry, its scope and its binding together or not at all', () => {
    const absent = shell['main'] === undefined;
    expect(assetsOf(shell)['run_worker_first'] === undefined).toBe(absent);
    expect(assetsOf(shell)['binding'] === undefined).toBe(absent);
  });

  it('uses the same not_found_handling, so the SPA-fallback trap is reproduced', () => {
    expect(assetsOf(test)['not_found_handling']).toBe(assetsOf(shell)['not_found_handling']);
  });

  it('binds the assets under the same name the Worker code uses', () => {
    expect(assetsOf(test)['binding']).toBe('ASSETS');
    // wrangler refuses an assets binding on an assets-only Worker.
    if (shell['main'] === undefined) {
      expect(assetsOf(shell)['binding']).toBeUndefined();
      return;
    }
    expect(assetsOf(shell)['binding']).toBe(assetsOf(test)['binding']);
  });

  it('declares every var the Worker reads from env', () => {
    const shellVars = Object.keys((shell['vars'] ?? {}) as object).sort();
    const testVars = Object.keys((test['vars'] ?? {}) as object).sort();
    expect(testVars).toEqual(shellVars);
  });

  /**
   * Parity is not enough on its own, and this is the case it cannot see: a var
   * removed from BOTH configs leaves them equal, so the test above stays green.
   *
   * That matters more than a missing value usually would. jose only validates
   * `issuer` when the option is DEFINED — pass undefined and it skips the check
   * silently rather than failing. So dropping this var would not break the
   * verifier loudly; it would quietly stop verifying who issued the token,
   * while every test still passed.
   *
   * ATLAS_JWT_AUDIENCE is deliberately absent from this list and from both
   * configs. The provider mints no `aud` claim, so passing one to jose would
   * reject every token — see verify.ts. It is listed here only so that its
   * absence reads as a decision rather than as the very omission this test
   * exists to catch.
   */
  it.each(['ATLAS_JWKS_URL', 'ATLAS_JWT_ISSUER'])(
    'declares %s absolutely, not merely identically in both configs',
    (name) => {
      expect(Object.keys((shell['vars'] ?? {}) as object)).toContain(name);
      expect(Object.keys((test['vars'] ?? {}) as object)).toContain(name);
    }
  );

  it('points the deployed config at this Worker source when it runs one', () => {
    if (shell['main'] === undefined) return;
    expect(shell['main']).toBe('../shell-bff/src/worker.ts');
  });

  /**
   * The dev entry trusts the mock auth's fake token. The guarantee that it
   * cannot reach production is not a flag but the bundle: the deployed config
   * never names it, so it is never bundled.
   */
  it('never ships the dev entry that trusts mock tokens', () => {
    expect(JSON.stringify(shell)).not.toContain('worker.dev');
  });
});
