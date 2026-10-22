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
  /**
   * Where the remote's remoteEntry.json lives. Absolute for a multi-origin
   * deployment, or root-relative (`/iam/remoteEntry.json`) for a same-origin,
   * path-routed one; the shell absolutises relative entries against the
   * manifest's own URL before federation sees them (ADR-0010).
   */
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

/** Where the domains get their data. Optional; absent means 'mock'. */
export type AtlasApiMode = 'mock' | 'http';

/**
 * Identity provider configuration. Both fields are browser-safe by design: the
 * URL is public and the publishable key is meant to ship in the bundle. The
 * service-role secret has no representation here and must never acquire one.
 *
 * It lives in the manifest for the same reason `apiMode` does (ADR-0010):
 * WHICH identity provider an environment uses is a deployment decision, not a
 * build one. Absent means the mock provider, so a fresh checkout still signs in
 * with no account anywhere.
 */
/**
 * Which identity provider an environment is configured for.
 *
 * It exists because the two providers do not take the same browser config, and
 * the difference is security-relevant rather than cosmetic: Supabase requires a
 * publishable key in this file, and Nhost has no equivalent — so for Nhost ANY
 * value in that field is a mistake, and the deploy gate can say so categorically
 * instead of trying to recognise a secret by its shape.
 */
export type AtlasAuthKind = 'supabase' | 'nhost';

export interface AtlasAuthConfig {
  /** Defaults to 'supabase' when absent, so manifests written before this stay valid. */
  kind?: AtlasAuthKind;
  /** Project URL — no trailing path. */
  url: string;
  /**
   * The browser-safe publishable (anon) key, never a service-role secret.
   *
   * REQUIRED for Supabase and FORBIDDEN for Nhost. Nhost's public endpoints
   * need no key at all, and its admin secret is an unprefixed random string
   * that no shape check could distinguish from a legitimate value — so the only
   * reliable rule is that the field must be absent.
   */
  publishableKey?: string;
  /** OIDC provider the sign-in button uses. Defaults to 'github'. */
  provider?: string;
}

export interface AtlasManifest {
  version: typeof ATLAS_MANIFEST_VERSION;
  /**
   * Whether the remotes talk to the edge BFF or their built-in mocks. It lives
   * here because it is environment configuration, and ADR-0010 puts environment
   * configuration in the manifest — a deployment artifact — rather than in the
   * build. Optional so every existing manifest stays valid.
   */
  apiMode?: AtlasApiMode;
  /**
   * The identity provider for this environment. Absent means the mock provider
   * (ADR-0006), which is why the console runs with no Supabase project at all.
   */
  auth?: AtlasAuthConfig;
  /**
   * Keyed by remote name. The key MUST equal the `name` in that remote's
   * federation.config.mjs — Native Federation verifies the fetched
   * remoteEntry's baked-in name and refuses aliases that don't match.
   */
  remotes: Record<string, RemoteDefinition>;
}

/**
 * Guard for the optional auth block.
 *
 * A malformed block fails the WHOLE manifest rather than being dropped, which
 * is deliberate and the safer direction: silently discarding a broken `auth`
 * would fall back to the MOCK provider, whose personas let anyone pick
 * 'admin'. An environment that meant to configure a real identity provider and
 * got it wrong must end up visibly empty, not quietly permissive.
 *
 * The practical result is a console with no remotes and the mock — loud and
 * useless rather than wrong. The edge BFF is unaffected either way: it verifies
 * tokens against its own JWKS and never consults this file.
 */
const AUTH_KINDS: readonly AtlasAuthKind[] = ['supabase', 'nhost'];

function isAtlasAuthConfig(value: unknown): value is AtlasAuthConfig {
  if (typeof value !== 'object' || value === null) return false;
  const auth = value as Partial<AtlasAuthConfig>;

  if (auth.kind !== undefined && !AUTH_KINDS.includes(auth.kind)) return false;
  if (typeof auth.url !== 'string' || auth.url.length === 0) return false;
  if (auth.provider !== undefined && (typeof auth.provider !== 'string' || auth.provider.length === 0)) {
    return false;
  }

  // Absent kind means Supabase, which is what every manifest written before the
  // discriminant existed meant.
  const kind: AtlasAuthKind = auth.kind ?? 'supabase';
  if (kind === 'nhost') {
    // Not "may be empty" — absent. A present-but-empty key is still someone
    // having put a value here, and the next edit fills it in.
    return auth.publishableKey === undefined;
  }
  return typeof auth.publishableKey === 'string' && auth.publishableKey.length > 0;
}

/** Runtime guard used by the shell before trusting a fetched manifest. */
export function isAtlasManifest(value: unknown): value is AtlasManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<AtlasManifest>;
  if (manifest.version !== ATLAS_MANIFEST_VERSION) return false;
  if (typeof manifest.remotes !== 'object' || manifest.remotes === null) return false;
  if (
    manifest.apiMode !== undefined &&
    manifest.apiMode !== 'mock' &&
    manifest.apiMode !== 'http'
  ) {
    return false;
  }
  if (manifest.auth !== undefined && !isAtlasAuthConfig(manifest.auth)) return false;
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
