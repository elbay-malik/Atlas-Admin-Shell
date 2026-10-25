import { Env, handleApi } from './worker';
import { Principal } from './authz';

/**
 * A DEV-ONLY Worker entry that trusts the mock auth's fake token.
 *
 * It exists so the browser-to-BFF path can be exercised end to end without an
 * identity provider: no Nhost project, no sign-in, no JWKS fetch. It is a
 * SEPARATE entry point, referenced only by wrangler.dev.jsonc: the production
 * config points `main` at worker.ts, so this bypass is not merely disabled in
 * the deployed artifact — it is not in it at all. config-parity.spec.ts
 * asserts that, because a flag someone could flip is a much weaker guarantee
 * than code that was never bundled.
 */
const MOCK_TOKEN = /^mock\.([\w-]+)\.(admin|viewer)$/;

async function verifyMockToken(request: Request) {
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  const parsed = MOCK_TOKEN.exec(token);
  if (!parsed) return { ok: false as const, status: 401 as const, reason: 'not a mock token' };

  const principal: Principal = {
    sub: parsed[1],
    email: `${parsed[1]}@atlas.dev`,
    role: parsed[2] as Principal['role'],
  };
  return { ok: true as const, principal };
}

/**
 * Serves the manifest with `apiMode: 'http'` so the remotes call the BFF.
 *
 * Done HERE rather than by copying a different manifest into dist: dist is
 * rebuilt by any `nx build shell`, which would silently restore the default
 * (mock) manifest underneath a running server, and the remotes would quietly go
 * back to their mocks while every request still looked healthy. Deriving it at
 * request time cannot drift.
 */
async function manifestWithHttpApi(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;
  const manifest = (await response.json()) as Record<string, unknown>;
  return new Response(JSON.stringify({ ...manifest, apiMode: 'http' }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/federation.manifest.json') {
      return manifestWithHttpApi(request, env);
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, verifyMockToken);
      } catch (error) {
        console.error('[bff-dev] unhandled error', error);
        return new Response(JSON.stringify({ status: 500, title: 'internal error' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
