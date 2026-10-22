import { AtlasRole } from '@atlas/shared-contracts';

/** A caller whose token verified. */
export interface Principal {
  sub: string;
  email: string;
  role: AtlasRole;
}

export type Method = 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE';

export interface RouteRule {
  method: Method;
  /** Path pattern; ':param' matches one segment. */
  pattern: string;
  /** Minimum role. Every route requires authentication — there are no public ones. */
  requires: AtlasRole;
}

/**
 * The authorization table, as data rather than scattered `if`s, so the whole
 * policy is reviewable in one place.
 *
 * The client already hides most of this, but hiding is UX: `canMatch` stops a
 * download, not a curl. These rules are the actual boundary.
 *
 * `PATCH /api/flags/:key` is admin-only. The flags screen now hides the control
 * from a viewer too (`flags-home.ts`, `canEdit()`), but that is UX and this is
 * the boundary: the order matters, and the server refused first. When this
 * comment was written the UI did NOT gate it, and the server still said no.
 */
export const ROUTES: readonly RouteRule[] = [
  { method: 'GET', pattern: '/api/iam/users', requires: 'admin' },
  { method: 'PATCH', pattern: '/api/iam/users/:id/role', requires: 'admin' },
  { method: 'PATCH', pattern: '/api/iam/users/:id/active', requires: 'admin' },
  { method: 'GET', pattern: '/api/flags', requires: 'viewer' },
  { method: 'PATCH', pattern: '/api/flags/:key', requires: 'admin' },
  { method: 'GET', pattern: '/api/audit', requires: 'viewer' },
];

export interface RouteMatch {
  rule: RouteRule;
  params: Record<string, string>;
}

/** Exact segment-count match, so /api/flags never swallows /api/flags/x. */
export function matchRoute(method: string, pathname: string): RouteMatch | null {
  const segments = pathname.split('/').filter(Boolean);
  for (const rule of ROUTES) {
    if (rule.method !== method) continue;
    const expected = rule.pattern.split('/').filter(Boolean);
    if (expected.length !== segments.length) continue;

    const params: Record<string, string> = {};
    const matched = expected.every((part, i) => {
      if (part.startsWith(':')) {
        try {
          params[part.slice(1)] = decodeURIComponent(segments[i]);
        } catch {
          // Malformed percent-encoding (a bare '%', or '%C0'). No real flag key
          // or user id decodes from it, so this rule simply does not match and
          // the request falls through to the JSON 404. Throwing here would
          // escape before authentication and answer with a runtime error page.
          return false;
        }
        return true;
      }
      return part === segments[i];
    });
    if (matched) return { rule, params };
  }
  return null;
}

/** Admins satisfy everything; viewers satisfy only 'viewer'. Mirrors AtlasAuth.hasRole. */
export function satisfies(role: AtlasRole, required: AtlasRole): boolean {
  return role === 'admin' || required === 'viewer';
}
