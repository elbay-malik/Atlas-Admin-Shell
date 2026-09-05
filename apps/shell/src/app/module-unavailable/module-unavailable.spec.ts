import { isInternalPath } from './module-unavailable';

/**
 * `returnUrl` is attacker-controllable: anyone can hand-craft
 * /unavailable/<remote>?returnUrl=… The Angular Router would not leave the
 * origin, but only a single-slash absolute path is a real in-app destination.
 */
describe('returnUrl handling', () => {
  it('accepts an in-app absolute path', () => {
    expect(isInternalPath('/iam')).toBe(true);
    expect(isInternalPath('/audit?tab=1')).toBe(true);
  });

  it('rejects a protocol-relative URL', () => {
    expect(isInternalPath('//evil.example')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(isInternalPath('https://evil.example/iam')).toBe(false);
    expect(isInternalPath('javascript:alert(1)')).toBe(false);
  });

  it('rejects a relative path and empty input', () => {
    expect(isInternalPath('iam')).toBe(false);
    expect(isInternalPath('')).toBe(false);
    expect(isInternalPath(null)).toBe(false);
  });
});
