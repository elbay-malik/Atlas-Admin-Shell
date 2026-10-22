import { toAtlasDisplayName, toAtlasEmail, toAtlasRole } from '@atlas/shared-contracts';
import { AuthUser } from '@atlas/shared-auth';

/**
 * Maps verified JWT claims onto the platform's user. Every field goes through
 * @atlas/shared-contracts so the edge BFF derives the same values this browser
 * code displays — see those functions for why allowed-roles is the only role
 * source, and why display name may never influence it.
 */
export function toAuthUser(claims: Record<string, unknown>): AuthUser | null {
  const id = typeof claims['sub'] === 'string' ? claims['sub'] : null;
  if (!id) return null;

  return {
    id,
    name: toAtlasDisplayName(claims),
    email: toAtlasEmail(claims),
    role: toAtlasRole(claims),
  };
}
