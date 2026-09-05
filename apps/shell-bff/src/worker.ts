import { type JWTVerifyGetKey, createRemoteJWKSet } from 'jose';
import { matchRoute, satisfies } from './authz';
import { type Store, seedStore } from './data';
import {
  isProblem,
  listAudit,
  listFlags,
  listUsers,
  setFlag,
  setUserActive,
  setUserRole,
} from './handlers';
import { createVerifier } from './verify';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ATLAS_JWKS_URL: string;
  ATLAS_JWT_ISSUER: string;
  ATLAS_JWT_AUDIENCE: string;
}

/**
 * Hoisted so the JWKS cache survives across requests in a warm isolate. Keyed
 * by URL because a Worker is reused across environments in local dev.
 */
const jwksCache = new Map<string, JWTVerifyGetKey>();
function resolveJwks(url: string): JWTVerifyGetKey {
  const cached = jwksCache.get(url);
  if (cached) return cached;
  const created = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, created);
  return created;
}

/** Per-isolate domain state; a database is a later slice. */
let store: Store | null = null;
function getStore(): Store {
  store ??= seedStore();
  return store;
}

/** Test seam: reset state between cases without exporting the mutable binding. */
export function __resetStore(): void {
  store = null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // API responses are per-caller and authorization-dependent; never cache.
      'cache-control': 'no-store',
    },
  });
}

const problem = (status: number, title: string) => json({ status, title }, status);

export async function handleApi(request: Request, env: Env, verify = defaultVerifier(env)) {
  const url = new URL(request.url);
  const match = matchRoute(request.method, url.pathname);

  // A JSON 404 built here, NOT a fall-through to env.ASSETS: that applies
  // not_found_handling, so an unknown /api path would come back as index.html
  // with a 200 and the client would fail on a confusing parse error.
  if (!match) return problem(404, 'no such endpoint');

  const verified = await verify(request);
  if (!verified.ok) return problem(401, 'authentication required');

  const { principal } = verified;
  if (!satisfies(principal.role, match.rule.requires)) {
    // 403, not 404: the caller is authenticated, and hiding existence here buys
    // nothing the shell's own redirect does not already disclose.
    return problem(403, 'insufficient role');
  }

  const state = getStore();
  const body = await readJson(request);
  const result = await route(state, principal, match, url, body);
  return isProblem(result) ? problem(result.problem.status, result.problem.title) : json(result.body);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET') return {};
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function route(
  state: Store,
  principal: { sub: string; email: string; role: 'admin' | 'viewer' },
  match: NonNullable<ReturnType<typeof matchRoute>>,
  url: URL,
  body: Record<string, unknown>
) {
  switch (match.rule.pattern) {
    case '/api/iam/users':
      return listUsers(state);
    case '/api/iam/users/:id/role':
      return setUserRole(state, principal, match.params['id'], body['role']);
    case '/api/iam/users/:id/active':
      return setUserActive(state, principal, match.params['id'], body['active']);
    case '/api/flags':
      return listFlags(state);
    case '/api/flags/:key':
      return setFlag(state, principal, match.params['key'], body['enabled']);
    case '/api/audit':
      return listAudit(state, url.searchParams.get('q'));
    default:
      return { problem: { status: 404, title: 'no such endpoint' } };
  }
}

function defaultVerifier(env: Env) {
  return createVerifier({
    jwks: resolveJwks(env.ATLAS_JWKS_URL),
    issuer: env.ATLAS_JWT_ISSUER,
    audience: env.ATLAS_JWT_AUDIENCE,
  });
}

/** `/api` and `/api/anything` both belong to the API, never to the SPA fallback. */
function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // run_worker_first only routes /api/* here, but a direct invocation (or a
    // future config change) must still be safe.
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);

    try {
      return await handleApi(request, env);
    } catch (error) {
      // An /api path ALWAYS answers JSON. Making that true by construction
      // beats having enumerated every throw: without this, an unhandled error
      // escapes as a workerd runtime page, which is neither JSON nor a status
      // this API documents. The cause is logged, never echoed — same reason the
      // verifier's reason is not returned to the caller.
      console.error('[bff] unhandled error', error);
      return problem(500, 'internal error');
    }
  },
};
