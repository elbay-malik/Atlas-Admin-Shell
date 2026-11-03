import {
  forgetIntendedRoute,
  rememberIntendedRoute,
  takeIntendedRoute,
  toSafeInternalPath,
} from './intended-route';

const ORIGIN = 'https://atlas.example';

describe('toSafeInternalPath', () => {
  it.each([
    ['/iam', '/iam'],
    ['/audit?q=ada#row-3', '/audit?q=ada#row-3'],
    ['/iam/users/1', '/iam/users/1'],
  ])('keeps %s', (raw, expected) => {
    expect(toSafeInternalPath(raw, ORIGIN)).toBe(expected);
  });

  /** Each of these is how "return to where you were" becomes an open redirect. */
  it.each([
    ['protocol-relative', '//evil.example/iam'],
    ['absolute', 'https://evil.example/iam'],
    ['same-looking prefix', 'https://atlas.example.evil.example/'],
    ['script scheme', 'javascript:alert(1)'],
    ['backslash, read as a slash', '/\\evil.example'],
    ['backslashes only', '\\\\evil.example'],
    ['tab inside the slashes, stripped by the parser', '/\t/evil.example'],
    ['newline', '/iam\nSet-Cookie: x'],
    ['no leading slash', 'iam'],
    ['empty', ''],
    ['very long', `/${'a'.repeat(3000)}`],
  ])('refuses %s', (_name, raw) => {
    expect(toSafeInternalPath(raw, ORIGIN)).toBeNull();
  });

  it('treats the overview as nothing to remember', () => {
    expect(toSafeInternalPath('/', ORIGIN)).toBeNull();
  });

  it('handles null', () => {
    expect(toSafeInternalPath(null, ORIGIN)).toBeNull();
  });
});

describe('the remembered route', () => {
  beforeEach(() => sessionStorage.clear());

  it('is returned once', () => {
    rememberIntendedRoute('/iam');
    expect(takeIntendedRoute()).toBe('/iam');
    expect(takeIntendedRoute()).toBeNull();
  });

  it('can be forgotten', () => {
    rememberIntendedRoute('/iam');
    forgetIntendedRoute();
    expect(takeIntendedRoute()).toBeNull();
  });

  it('never stores an unsafe value', () => {
    rememberIntendedRoute('//evil.example');
    expect(sessionStorage.length).toBe(0);
  });

  it('re-validates on the way out, because storage is not trusted input', () => {
    sessionStorage.setItem('atlas.auth.intended', 'https://evil.example/');
    expect(takeIntendedRoute()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
