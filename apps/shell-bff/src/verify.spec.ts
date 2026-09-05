import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createVerifier } from './verify';

/**
 * The security-critical path, exercised for real with no identity provider:
 * the test generates its own ES256 key pair, signs tokens with it, and serves
 * the public half through a local JWKS. That proves the crypto, the algorithm
 * pinning and the claim validation byte for byte. What it cannot prove is the
 * configured JWKS URL, the real issuer string, or that the provider ever mints
 * an atlas_role claim.
 */
const ISSUER = 'https://atlas.test/auth/v1';
const AUDIENCE = 'authenticated';

let signingKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;
let attackerKey: CryptoKey;
/** An RSA key the JWKS DOES publish — the algorithm-confusion probe. */
let rsaKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  signingKey = pair.privateKey;

  const rsaPair = await generateKeyPair('RS256', { extractable: true });
  rsaKey = rsaPair.privateKey;

  jwks = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(pair.publicKey)), alg: 'ES256' },
      { ...(await exportJWK(rsaPair.publicKey)), alg: 'RS256' },
    ],
  });

  // A different, valid key that the JWKS does not publish.
  attackerKey = (await generateKeyPair('ES256', { extractable: true })).privateKey;
});

interface TokenOptions {
  key?: CryptoKey;
  alg?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  claims?: Record<string, unknown>;
  /** Pass `false` to mint a token with no `sub` at all. */
  subject?: string | false;
}

async function token(options: TokenOptions = {}): Promise<string> {
  const builder = new SignJWT({ email: 'ada@atlas.dev', ...(options.claims ?? {}) })
    .setProtectedHeader({ alg: options.alg ?? 'ES256' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? '5m');
  if (options.subject !== false) builder.setSubject(options.subject ?? 'u-1');
  return builder.sign(options.key ?? signingKey);
}

const request = (bearer?: string) =>
  new Request('https://atlas.test/api/flags', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });

function verifier() {
  return createVerifier({ jwks, issuer: ISSUER, audience: AUDIENCE });
}

describe('token verification', () => {
  it('accepts a correctly signed token and derives the principal', async () => {
    const result = await verifier()(request(await token()));
    expect(result).toMatchObject({
      ok: true,
      principal: { sub: 'u-1', email: 'ada@atlas.dev', role: 'viewer' },
    });
  });

  it('reads admin from app_metadata, the service-role-only field', async () => {
    const result = await verifier()(
      request(await token({ claims: { app_metadata: { atlas_role: 'admin' } } }))
    );
    expect(result).toMatchObject({ ok: true, principal: { role: 'admin' } });
  });

  it('reads admin from a custom access token hook claim', async () => {
    const result = await verifier()(request(await token({ claims: { atlas_role: 'admin' } })));
    expect(result).toMatchObject({ ok: true, principal: { role: 'admin' } });
  });

  /** The whole point of deriving the role server-side rather than trusting the client. */
  it('IGNORES a role smuggled in user_metadata', async () => {
    const result = await verifier()(
      request(await token({ claims: { user_metadata: { atlas_role: 'admin' } } }))
    );
    expect(result).toMatchObject({ ok: true, principal: { role: 'viewer' } });
  });

  it('IGNORES the database role claim', async () => {
    const result = await verifier()(request(await token({ claims: { role: 'admin' } })));
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

  it('rejects a token from another issuer', async () => {
    const result = await verifier()(request(await token({ issuer: 'https://evil.example' })));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects a token minted for another audience', async () => {
    const result = await verifier()(request(await token({ audience: 'someone-else' })));
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
   * Algorithm confusion is the attack the pinned `algorithms: ['ES256']` exists
   * to stop, and it was the one protection with no regression coverage — the
   * suite stayed green with the pin deleted. This token is signed with a key the
   * JWKS genuinely publishes, so ONLY the algorithm pin can refuse it.
   */
  it('rejects a validly signed token that uses an algorithm we do not accept', async () => {
    const rsaToken = await token({ key: rsaKey, alg: 'RS256' });
    expect(await verifier()(request(rsaToken))).toMatchObject({ ok: false, status: 401 });
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
