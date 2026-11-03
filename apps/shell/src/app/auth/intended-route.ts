/** sessionStorage: per tab, and it survives the round trip to the provider. */
const STORAGE_KEY = 'atlas.auth.intended';
const MAX_LENGTH = 2048;

/**
 * A backslash is a slash to the URL parser, so `/\evil.example` leaves the origin,
 * and it strips tabs and newlines, so `/<tab>/evil.example` does too.
 */
function hasUnsafeCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return char === '\\' || code < 0x20 || code === 0x7f;
  });
}

/**
 * The path, query and hash of `raw` if it stays on this origin, otherwise null.
 *
 * The router would only ever navigate within the app, so this is defence in
 * depth, and it is what keeps "go back where you were" from becoming an open
 * redirect if the value is ever used for anything else. `/` counts as nothing
 * to remember, since the provider returns there anyway.
 *
 * The route never travels in the provider's `redirectTo`: that stays our bare
 * origin, the one value the allow-list holds (ADR-0014).
 */
export function toSafeInternalPath(raw: string | null, origin: string): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || hasUnsafeCharacter(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path === '/' ? null : path;
}

export function rememberIntendedRoute(path: string, origin = location.origin): void {
  const safe = toSafeInternalPath(path, origin);
  if (!safe) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // Storage refused: sign-in still works, it just lands on the overview.
  }
}

export function forgetIntendedRoute(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing was stored, then
  }
}

/** Returns the remembered route once. Re-validated: storage is not trusted input. */
export function takeIntendedRoute(origin = location.origin): string | null {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  forgetIntendedRoute();
  return toSafeInternalPath(stored, origin);
}
