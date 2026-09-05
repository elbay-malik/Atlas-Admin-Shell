import { AtlasRole } from '@atlas/shared-contracts';
import { AuthUser } from '@atlas/shared-auth';

/**
 * Maps verified JWT claims onto the platform's user. Security-critical, for two
 * reasons that are easy to get wrong:
 *
 * - The role is NEVER read from `user_metadata`. Supabase documents that as
 *   editable by the user without any checks, so trusting it would let anyone
 *   grant themselves admin. `app_metadata` is writable only with the service
 *   role, and a Custom Access Token Hook claim is equally trustworthy.
 * - It is NEVER read from the `role` claim either. That is the Postgres role and
 *   is literally "authenticated" for every signed-in user.
 *
 * Anything unrecognised fails CLOSED to 'viewer'.
 */
export function toAuthUser(claims: Record<string, unknown>): AuthUser | null {
  const id = typeof claims['sub'] === 'string' ? claims['sub'] : null;
  if (!id) return null;

  const appMetadata = asRecord(claims['app_metadata']);
  const claimed = claims['atlas_role'] ?? appMetadata['atlas_role'];
  const role: AtlasRole = claimed === 'admin' ? 'admin' : 'viewer';

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
