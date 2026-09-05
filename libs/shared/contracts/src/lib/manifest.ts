/**
 * The federation manifest is the platform's remote REGISTRY: the shell derives
 * both its router config and its navigation from these entries, so enabling a
 * remote in an environment is a manifest edit — never a shell rebuild.
 *
 * This shape is a versioned cross-MFE contract; breaking changes require a
 * new `version`.
 */

export const ATLAS_MANIFEST_VERSION = 1;

export type AtlasRole = 'admin' | 'viewer';

export interface RemoteDefinition {
  /** Absolute URL of the remote's remoteEntry.json. */
  url: string;
  /** Human-readable name, used for nav items and document titles. */
  displayName: string;
  /** Top-level route segment the remote owns (no leading slash). */
  route: string;
  /** Emoji or icon-font token rendered next to the nav label. */
  icon: string;
  /** Module key the remote exposes for its routes (e.g. "./Routes"). */
  exposedModule: string;
  /** Minimum role required to see and enter the remote. */
  requiredRole: AtlasRole;
}

export interface AtlasManifest {
  version: typeof ATLAS_MANIFEST_VERSION;
  /**
   * Keyed by remote name. The key MUST equal the `name` in that remote's
   * federation.config.mjs — Native Federation verifies the fetched
   * remoteEntry's baked-in name and refuses aliases that don't match.
   */
  remotes: Record<string, RemoteDefinition>;
}

/** Runtime guard used by the shell before trusting a fetched manifest. */
export function isAtlasManifest(value: unknown): value is AtlasManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<AtlasManifest>;
  if (manifest.version !== ATLAS_MANIFEST_VERSION) return false;
  if (typeof manifest.remotes !== 'object' || manifest.remotes === null) return false;
  return Object.values(manifest.remotes).every(
    (def) =>
      // a null/non-object entry is legal JSON; dereferencing it here would
      // throw out of the guard and take the whole shell down with it
      typeof def === 'object' &&
      def !== null &&
      typeof def.url === 'string' &&
      typeof def.displayName === 'string' &&
      typeof def.route === 'string' &&
      typeof def.icon === 'string' &&
      typeof def.exposedModule === 'string' &&
      (def.requiredRole === 'admin' || def.requiredRole === 'viewer')
  );
}
