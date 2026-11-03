/**
 * How a verified token's claims become an Atlas identity.
 *
 * This lives in contracts, not in the shell, because BOTH the browser provider
 * and the edge BFF must agree on what "admin" means. Two implementations of
 * this rule would eventually disagree, and the disagreement would be a
 * privilege bug. Angular-free by declaration, so the Worker can import it
 * without pulling a framework.
 */
import { AtlasRole } from './manifest';

/**
 * Hasura-style tokens carry every custom claim inside one namespaced object
 * rather than at the top level, so every read here goes through it.
 */
export const CLAIMS_NAMESPACE = 'https://hasura.io/jwt/claims';

/** Server-minted list of roles the user MAY act as. */
export const ALLOWED_ROLES_CLAIM = 'x-hasura-allowed-roles';
/** The role the user acts as by default — deliberately not the role source. */
export const DEFAULT_ROLE_CLAIM = 'x-hasura-default-role';
/** Optional custom claims; absent unless configured on the identity project. */
export const EMAIL_CLAIM = 'x-hasura-email';

/**
 * Display name arrives under one of two keys, and both are read on purpose.
 *
 * The claim name is configured in the identity project's dashboard — outside
 * this repository — and the provider derives the key from whatever was typed
 * there. This project emits `x-hasura-displayname`, observed in a real token,
 * while `x-hasura-display-name` is what the hyphenated convention suggests.
 *
 * Accepting both is not defensive mush: the alternative is that an edit to a
 * dashboard field nobody here can see silently blanks the console's header,
 * with nothing failing and nothing to grep for. A display name carries no
 * authority (see below), so widening where it may come from costs nothing.
 */
export const DISPLAY_NAME_CLAIMS = ['x-hasura-display-name', 'x-hasura-displayname'] as const;

/** The provider role that grants Atlas's admin role. */
export const ADMIN_ROLE = 'admin';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function namespace(claims: Record<string, unknown>): Record<string, unknown> {
  return asRecord(claims[CLAIMS_NAMESPACE]);
}

/**
 * Derives the platform role from verified JWT claims, failing CLOSED.
 *
 * ONE source is trusted: `x-hasura-allowed-roles` containing `admin`. That list
 * is minted by the auth server from the user's assigned roles and cannot be set
 * by the user, which is the whole reason it is the source.
 *
 * NOT `x-hasura-default-role`, and that distinction is not academic — it was
 * measured. A real token for a user holding the admin role reads:
 *
 *   x-hasura-allowed-roles : ["user", "me", "admin"]
 *   x-hasura-default-role  : "user"
 *
 * Default-role is the role you are ACTING AS; allowed-roles is what you MAY be.
 * Atlas has no role-switching, so reading default-role would have made a
 * genuine admin a viewer — a lockout that fails closed and therefore looks like
 * correct behaviour right up until nobody can administer anything.
 *
 * NOT the user's own metadata or display name either: both are editable by the
 * user through the auth API, so trusting either would let anyone self-promote.
 */
export function toAtlasRole(claims: Record<string, unknown>): AtlasRole {
  const allowed = namespace(claims)[ALLOWED_ROLES_CLAIM];
  return Array.isArray(allowed) && allowed.includes(ADMIN_ROLE) ? 'admin' : 'viewer';
}

/**
 * The caller's email, or '' when the project does not mint the claim.
 *
 * It is optional because the identity provider does not include an email in its
 * access tokens by default — a real token's payload is exactly `exp, iat, iss,
 * sub` plus the namespace. Adding it is one custom-claim setting, and until
 * then both consumers degrade rather than break: the console shows the user's
 * id, and the edge writes audit entries against `sub` instead of an address.
 */
export function toAtlasEmail(claims: Record<string, unknown>): string {
  const value = namespace(claims)[EMAIL_CLAIM];
  return typeof value === 'string' ? value : '';
}

/**
 * Who an audit entry names: the email, or the user id when there is no email.
 *
 * `||`, not `??`, is the point. A missing email is '' (see toAtlasEmail), which
 * `??` lets through, and isAtlasEvent rejects an event with a blank actor. The
 * edge applies the same rule to its own entries (`principal.email || principal.sub`).
 */
export function toAtlasActor(identity: { id: string; email: string }): string {
  return identity.email || identity.id;
}

/**
 * A human-readable name, falling back to email and then to the subject.
 *
 * Display name is USER-EDITABLE, which is fine here and nowhere else: it names
 * a person on screen and carries no authority. It must never reach toAtlasRole.
 */
export function toAtlasDisplayName(claims: Record<string, unknown>): string {
  const ns = namespace(claims);
  for (const key of DISPLAY_NAME_CLAIMS) {
    const value = ns[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const email = toAtlasEmail(claims);
  if (email.length > 0) return email;
  return typeof claims['sub'] === 'string' ? claims['sub'] : '';
}
