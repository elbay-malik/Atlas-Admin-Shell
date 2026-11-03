/**
 * The origin a remote is served from, for showing to a person.
 *
 * A manifest may carry a relative url, which resolves against the manifest's own
 * location at boot (ADR-0010). There is no origin to show for one, so the raw value
 * is shown instead of inventing this page's own origin, which would claim the remote
 * is served from here when it is not.
 */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
