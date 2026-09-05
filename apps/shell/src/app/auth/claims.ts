import { toAtlasRole } from '@atlas/shared-contracts';
import { AuthUser } from '@atlas/shared-auth';

/**
 * Maps verified JWT claims onto the platform's user. The role derivation itself
 * lives in @atlas/shared-contracts (toAtlasRole) so the edge BFF enforces the
 * exact same rule this browser code displays — see that function for why
 * user_metadata and the `role` claim are both untrustworthy.
 */
export function toAuthUser(claims: Record<string, unknown>): AuthUser | null {
  const id = typeof claims['sub'] === 'string' ? claims['sub'] : null;
  if (!id) return null;

  const appMetadata = asRecord(claims['app_metadata']);
  // The role rule lives in @atlas/shared-contracts so the browser and the edge
  // BFF cannot drift apart on what "admin" means.
  const role = toAtlasRole(claims);

  const email = typeof claims['email'] === 'string' ? claims['email'] : '';
  const name =
    typeof appMetadata['full_name'] === 'string' && appMetadata['full_name'].length > 0
      ? appMetadata['full_name']
      : email || id;

  return { id, name, email, role };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
