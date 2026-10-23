import { CLAIMS_NAMESPACE } from '@atlas/shared-contracts';
import { toAuthUser } from './claims';

/**
 * Fixtures are shaped like a REAL token from the identity provider, captured
 * during the migration. The namespace object is the whole claim surface; there
 * is nothing at the top level but `exp`, `iat`, `iss` and `sub`.
 */
const claims = (ns: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
  sub: '7833c50f-5e99-4ad2-8a88-1e326f591990',
  iss: 'https://project.auth.eu-central-1.nhost.run/v1',
  [CLAIMS_NAMESPACE]: {
    'x-hasura-user-id': '7833c50f-5e99-4ad2-8a88-1e326f591990',
    'x-hasura-user-is-anonymous': 'false',
    ...ns,
  },
  ...top,
});

describe('toAuthUser', () => {
  it('grants admin when the allowed roles include it', () => {
    const user = toAuthUser(
      claims({ 'x-hasura-allowed-roles': ['user', 'me', 'admin'], 'x-hasura-default-role': 'user' })
    );
    expect(user?.role).toBe('admin');
  });

  /**
   * The case that decided the implementation, taken from a measured token: a
   * user holding the admin role still has default-role "user", because default
   * is what you ACT AS and allowed is what you MAY be. Reading default-role
   * made a genuine admin a viewer — a lockout that fails closed and therefore
   * looks like correct behaviour until nobody can administer anything.
   */
  it('grants admin even though the default role is user', () => {
    const user = toAuthUser(
      claims({ 'x-hasura-allowed-roles': ['user', 'me', 'admin'], 'x-hasura-default-role': 'user' })
    );
    expect(user?.role).toBe('admin');
  });

  it('is a viewer when admin is not among the allowed roles', () => {
    const user = toAuthUser(
      claims({ 'x-hasura-allowed-roles': ['user', 'me'], 'x-hasura-default-role': 'user' })
    );
    expect(user?.role).toBe('viewer');
  });

  it('IGNORES a default role of admin without the allowed-roles entry', () => {
    // Belt and braces: a token shaped this way should not exist, and if one
    // ever does it must not be a promotion.
    const user = toAuthUser(
      claims({ 'x-hasura-allowed-roles': ['user'], 'x-hasura-default-role': 'admin' })
    );
    expect(user?.role).toBe('viewer');
  });

  it('IGNORES a role claimed at the top level, outside the namespace', () => {
    // Anything outside the namespace is not minted by the auth server's role
    // machinery, so it carries no authority here.
    const user = toAuthUser(claims({ 'x-hasura-allowed-roles': ['user'] }, { atlas_role: 'admin' }));
    expect(user?.role).toBe('viewer');
  });

  it('IGNORES a display name that says admin, because it is user-editable', () => {
    const user = toAuthUser(
      claims({ 'x-hasura-allowed-roles': ['user'], 'x-hasura-display-name': 'admin' })
    );
    expect(user?.role).toBe('viewer');
  });

  it('fails closed when the namespace is missing entirely', () => {
    expect(toAuthUser({ sub: 'u-1' })?.role).toBe('viewer');
  });

  it('fails closed when allowed-roles is not an array', () => {
    expect(toAuthUser(claims({ 'x-hasura-allowed-roles': 'admin' }))?.role).toBe('viewer');
  });

  it('uses the display name when the project mints one', () => {
    const user = toAuthUser(
      claims({ 'x-hasura-display-name': 'Elbay Malik', 'x-hasura-email': 'e@example.com' })
    );
    expect(user?.name).toBe('Elbay Malik');
    expect(user?.email).toBe('e@example.com');
  });

  /**
   * The key is configured in a dashboard outside this repository, and the
   * provider derives it from whatever was typed there. A real token from this
   * project arrived under the unhyphenated spelling; the hyphenated one is what
   * the convention suggests. Both are read, so a dashboard edit cannot blank
   * the header with nothing failing.
   */
  it('also accepts the unhyphenated spelling a real token arrived under', () => {
    const user = toAuthUser(claims({ 'x-hasura-displayname': 'Elbay Malik' }));
    expect(user?.name).toBe('Elbay Malik');
  });

  it('still refuses to take a role from either spelling', () => {
    // Display name is user-editable; widening where it may come from must not
    // widen what it can do.
    expect(toAuthUser(claims({ 'x-hasura-displayname': 'admin' }))?.role).toBe('viewer');
  });

  it('falls back to email, then to the subject, when no name is minted', () => {
    expect(toAuthUser(claims({ 'x-hasura-email': 'e@example.com' }))?.name).toBe('e@example.com');
    // What production looks like TODAY: no email claim and no display name, so
    // the console shows the id rather than an empty header.
    expect(toAuthUser(claims())?.name).toBe('7833c50f-5e99-4ad2-8a88-1e326f591990');
    expect(toAuthUser(claims())?.email).toBe('');
  });

  it('rejects claims with no subject', () => {
    expect(toAuthUser({ [CLAIMS_NAMESPACE]: { 'x-hasura-allowed-roles': ['admin'] } })).toBeNull();
  });
});
