import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createVerifier } from './verify';

/**
 * The security-critical path, exercised for real with no identity provider:
 * the test generates its own RS256 key pair, signs tokens with it, and serves
 * the public half through a local JWKS. That proves the crypto, the algorithm
 * pinning and the claim validation byte for byte. What it cannot prove is the
 * configured JWKS URL, the real issuer string, or that the provider ever mints
 * the role claim.
 *
 * RS256 rather than ES256 because the identity provider signs with RSA and
 * supports no EC algorithm at all. The ES256 key below is now the
 * algorithm-confusion probe: a key the JWKS genuinely publishes, which the
 * verifier must still refuse to accept for a token that names it.
 */
const ISSUER = 'https://atlas.test/v1';

let signingKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;
let attackerKey: CryptoKey;
/** An EC key the JWKS DOES publish — the algorithm-confusion probe. */
let ecKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;

  const ecPair = await generateKeyPair('ES256', { extractable: true });
  ecKey = ecPair.privateKey;

  jwks = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(pair.publicKey)), alg: 'RS256' },
      { ...(await exportJWK(ecPair.publicKey)), alg: 'ES256' },
    ],
  });

  // A different, valid key that the JWKS does not publish.
  attackerKey = (await generateKeyPair('RS256', { extractable: true })).privateKey;
});

interface TokenOptions {
  key?: CryptoKey;
  alg?: string;
  issuer?: string;
  /** Pass a value to mint a token that carries an `aud`; omitted by default. */
  audience?: string;
  /** Pass `false` to mint a token with no `exp` at all. */
  expiresIn?: string | false;
  claims?: Record<string, unknown>;
  /** Merged into the namespace object, where custom claims actually live. */
  namespace?: Record<string, unknown>;
  /** Pass `false` to mint a token with no `sub` at all. */
  subject?: string | false;
}

async function token(options: TokenOptions = {}): Promise<string> {
  // Shaped like a real token: everything custom lives inside the namespace,
  // and the top level carries only the registered claims.
  const builder = new SignJWT({
    'https://hasura.io/jwt/claims': {
      'x-hasura-user-id': 'u-1',
      'x-hasura-allowed-roles': ['user', 'me'],
      'x-hasura-default-role': 'user',
      'x-hasura-email': 'ada@atlas.dev',
      ...(options.namespace ?? {}),
    },
    ...(options.claims ?? {}),
  })
    .setProtectedHeader({ alg: options.alg ?? 'RS256' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER);
  // No audience by default — the real provider mints none, so the default
  // token here is shaped like the one production actually receives.
  if (options.audience !== undefined) builder.setAudience(options.audience);
  if (options.expiresIn !== false) builder.setExpirationTime(options.expiresIn ?? '5m');
  if (options.subject !== false) builder.setSubject(options.subject ?? 'u-1');
  return builder.sign(options.key ?? signingKey);
}

const request = (bearer?: string) =>
  new Request('https://atlas.test/api/flags', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });

function verifier() {
  return createVerifier({ jwks, issuer: ISSUER });
}

/**
 * What a demo session (ADR-0015) can send. It has no token, so it sends no header,
 * and the shell's spec proves that half. The rest pins this half: nothing shaped
 * like a demo credential gets past the production verifier. worker.dev.ts does
 * trust `mock.*` strings, which is why it is not in the deployed artifact.
 */
describe('a demo session at the edge', () => {
  it('is refused with no Authorization header, which is all it ever sends', async () => {
    expect(await verifier()(request())).toMatchObject({ ok: false, status: 401 });
  });

  it('is refused if a demo-shaped token is forged', async () => {
    for (const forged of ['mock.demo.admin', 'demo', 'null', 'undefined']) {
      expect(await verifier()(request(forged))).toMatchObject({ ok: false, status: 401 });
    }
  });

  it('is refused for a signed token claiming to be the demo user, with a key we did not publish', async () => {
    const forged = await token({
      key: attackerKey,
      subject: 'demo',
      namespace: { 'x-hasura-allowed-roles': ['admin'] },
    });
    expect(await verifier()(request(forged))).toMatchObject({ ok: false, status: 401 });
  });
});

describe('token verification', () => {
  it('accepts a correctly signed token and derives the principal', async () => {
    const result = await verifier()(request(await token()));
    expect(result).toMatchObject({
      ok: true,
      principal: { sub: 'u-1', email: 'ada@atlas.dev', role: 'viewer' },
    });
  });

  it('reads admin from the server-minted allowed-roles list', async () => {
    const result = await verifier()(
      request(await token({ namespace: { 'x-hasura-allowed-roles': ['user', 'me', 'admin'] } }))
    );
    expect(result).toMatchObject({ ok: true, principal: { role: 'admin' } });
  });

  /**
   * Measured from a real token: a user holding the admin role still has
   * default-role "user". Reading default-role would make a genuine admin a
   * viewer — failing closed, and therefore invisible until nobody can
   * administer anything.
   */
  it('grants admin even though the default role stays user', async () => {
    const result = await verifier()(
      request(
        await token({
          namespace: {
            'x-hasura-allowed-roles': ['user', 'me', 'admin'],
            'x-hasura-default-role': 'user',
          },
        })
      )
    );
    expect(result).toMatchObject({ ok: true, principal: { role: 'admin' } });
  });

  /** The whole point of deriving the role server-side rather than trusting the client. */
  it('IGNORES a default role of admin without the allowed-roles entry', async () => {
    const result = await verifier()(
      request(await token({ namespace: { 'x-hasura-default-role': 'admin' } }))
    );
    expect(result).toMatchObject({ ok: true, principal: { role: 'viewer' } });
  });

  it('IGNORES a role smuggled in at the top level, outside the namespace', async () => {
    const result = await verifier()(
      request(await token({ claims: { atlas_role: 'admin', role: 'admin' } }))
    );
    expect(result).toMatchObject({ ok: true, principal: { role: 'viewer' } });
  });

  it('rejects a token signed by a key the JWKS does not publish', async () => {
    const result = await verifier()(request(await token({ key: attackerKey })));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects an expired token', async () => {
    const result = await verifier()(request(await token({ expiresIn: '-1m' })));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  /**
   * jose only checks an expiry that is PRESENT, so a token minted without `exp`
   * is not expired and never becomes expired — it verifies forever. The suite
   * could not see this: the factory above always set an expiry, so every token
   * it ever produced had one. `requiredClaims: ['exp']` is the only thing that
   * refuses this, which makes it the kind of protection that must be pinned by
   * a test that fails when only that protection is removed.
   */
  it('REJECTS a token with no exp, which would otherwise be valid forever', async () => {
    const immortal = await token({ expiresIn: false });

    const result = await verifier()(request(immortal));

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 401 });
  });

  it('still accepts an otherwise identical token that does carry an exp', async () => {
    // proves the case above fails on the missing claim, not on something else
    const result = await verifier()(request(await token({ expiresIn: '5m' })));

    expect(result.ok).toBe(true);
  });

  it('rejects a token from another issuer', async () => {
    const result = await verifier()(request(await token({ issuer: 'https://evil.example' })));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  /**
   * The audience check was REMOVED, not forgotten, and this pins the removal.
   *
   * The provider mints no `aud` claim, and jose rejects a token that lacks one
   * whenever an `audience` option is passed — so restoring the check would 401
   * every request in production with a perfectly valid signature. Accepting a
   * token that carries an unexpected audience is the observable consequence of
   * that decision, and asserting it here means re-adding the check breaks a
   * test instead of breaking production.
   *
   * What the check would have constrained is covered by `issuer`, which is
   * still pinned: this provider serves one project and one consumer.
   */
  it('accepts a token whatever audience it names, because audience is not checked', async () => {
    const result = await verifier()(request(await token({ audience: 'someone-else' })));
    expect(result).toMatchObject({ ok: true });
  });

  it('accepts a token carrying no audience at all, which is what production sends', async () => {
    const result = await verifier()(request(await token()));
    expect(result).toMatchObject({ ok: true });
  });

  it('still rejects a token minted by another issuer', async () => {
    const result = await verifier()(request(await token({ issuer: 'https://evil.test/v1' })));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const [header, payload] = (await token()).split('.');
    const none = `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '')}.${payload}.`;
    expect(await verifier()(request(none))).toMatchObject({ ok: false, status: 401 });
    expect(await verifier()(request(`${header}.${payload}.`))).toMatchObject({ ok: false });
  });

  it('rejects a tampered payload', async () => {
    const [header, , signature] = (await token()).split('.');
    const forged = btoa(JSON.stringify({ sub: 'u-1', atlas_role: 'admin' })).replace(/=+$/, '');
    expect(await verifier()(request(`${header}.${forged}.${signature}`))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('rejects a missing or malformed authorization header', async () => {
    expect(await verifier()(request())).toMatchObject({ ok: false, status: 401 });
    const noScheme = new Request('https://atlas.test/api/flags', {
      headers: { authorization: await token() },
    });
    expect(await verifier()(noScheme)).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects garbage that is not a token at all', async () => {
    expect(await verifier()(request('not-a-token'))).toMatchObject({ ok: false, status: 401 });
  });

  /**
   * Algorithm confusion is the attack the pinned `algorithms: ['RS256']` exists
   * to stop, and it was the one protection with no regression coverage — the
   * suite stayed green with the pin deleted. This token is signed with a key the
   * JWKS genuinely publishes, so ONLY the algorithm pin can refuse it.
   *
   * The probe swapped direction with the migration: RS256 is now the accepted
   * algorithm and ES256 is the one that must be refused. Keeping a published-
   * but-unaccepted key in the JWKS is what gives this test its teeth — a probe
   * signed with an unpublished key would be rejected by the signature check and
   * prove nothing about the pin.
   */
  it('rejects a validly signed token that uses an algorithm we do not accept', async () => {
    const ecToken = await token({ key: ecKey, alg: 'ES256' });
    expect(await verifier()(request(ecToken))).toMatchObject({ ok: false, status: 401 });
  });

  /** The guard that keeps an identity-less principal out of the handlers. */
  it('rejects a token with no subject, even though it verifies', async () => {
    const noSubject = await token({ subject: false });
    expect(await verifier()(request(noSubject))).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects an empty bearer value', async () => {
    const empty = new Request('https://atlas.test/api/flags', {
      headers: { authorization: 'Bearer ' },
    });
    expect(await verifier()(empty)).toMatchObject({ ok: false, status: 401 });
  });
});
