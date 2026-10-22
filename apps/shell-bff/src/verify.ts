import { AtlasRole, toAtlasRole } from '@atlas/shared-contracts';
import { type JWTVerifyGetKey, jwtVerify } from 'jose';
import { Principal } from './authz';

export interface VerifierOptions {
  /**
   * Key resolver. Production passes createRemoteJWKSet(url) hoisted to module
   * scope so its cache survives across requests in a warm isolate; tests pass
   * createLocalJWKSet over a generated key. Injecting it is what makes the
   * crypto path genuinely testable with no identity provider.
   */
  jwks: JWTVerifyGetKey;
  issuer: string;
  audience: string;
}

export type VerifyResult =
  | { ok: true; principal: Principal }
  | { ok: false; status: 401; reason: string };

const BEARER = /^Bearer (.+)$/;

/**
 * Verifies the caller's token and derives their platform role.
 *
 * `algorithms` is pinned explicitly rather than left to jose's default of
 * "whatever suits the key": an unpinned verifier is how algorithm-confusion
 * attacks get in. Issuer and audience are checked for the same reason — a
 * valid signature from the wrong issuer is still not a valid caller.
 *
 * `requiredClaims: ['exp']` is load-bearing and easy to miss: jose only checks
 * an expiry that is PRESENT. A token minted without `exp` is not expired and
 * never becomes expired, so without this it verifies forever — a credential
 * that cannot be outlived, issued by anyone who can mint one. Demanding the
 * claim is the difference between "this token is still valid" and "this token
 * was never given a lifetime".
 */
export function createVerifier(options: VerifierOptions) {
  return async function verify(request: Request): Promise<VerifyResult> {
    const header = request.headers.get('authorization') ?? '';
    const token = BEARER.exec(header)?.[1];
    if (!token) return { ok: false, status: 401, reason: 'missing bearer token' };

    try {
      const { payload } = await jwtVerify(token, options.jwks, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['ES256'],
        clockTolerance: 5,
        requiredClaims: ['exp'],
      });

      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      if (!sub) return { ok: false, status: 401, reason: 'token has no subject' };

      const role: AtlasRole = toAtlasRole(payload as Record<string, unknown>);
      const email = typeof payload['email'] === 'string' ? payload['email'] : '';
      return { ok: true, principal: { sub, email, role } };
    } catch (error) {
      // Deliberately coarse to the caller, but not silent: without this an
      // expired token, a wrong issuer and a forged signature are
      // indistinguishable to an operator debugging a 401.
      const reason = error instanceof Error ? error.message : 'token rejected';
      console.warn('[bff] token rejected:', reason);
      return { ok: false, status: 401, reason };
    }
  };
}
