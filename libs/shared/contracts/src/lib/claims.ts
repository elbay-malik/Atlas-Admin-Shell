/**
 * How a verified token's claims become an Atlas role.
 *
 * This lives in contracts, not in the shell, because BOTH the browser provider
 * and the edge BFF must agree on what "admin" means. Two implementations of
 * this rule would eventually disagree, and the disagreement would be a
 * privilege bug. Angular-free by declaration, so the Worker can import it
 * without pulling a framework.
 */
import { AtlasRole } from './manifest';

/** The claim carrying the platform role, whether from a hook or app_metadata. */
export const ATLAS_ROLE_CLAIM = 'atlas_role';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Derives the platform role from verified JWT claims, failing CLOSED.
 *
 * Two sources are trusted, and only two:
 * - a top-level `atlas_role` claim, as minted by a Custom Access Token Hook;
 * - `app_metadata.atlas_role`, which only the service role can write.
 *
 * Never `user_metadata`, which the identity provider documents as editable by
 * the user without checks — trusting it would let anyone self-promote. Never
 * the `role` claim either: that is the database role, and it is the same string
 * for every signed-in user.
 */
export function toAtlasRole(claims: Record<string, unknown>): AtlasRole {
  const appMetadata = asRecord(claims['app_metadata']);
  const claimed = claims[ATLAS_ROLE_CLAIM] ?? appMetadata[ATLAS_ROLE_CLAIM];
  return claimed === 'admin' ? 'admin' : 'viewer';
}
