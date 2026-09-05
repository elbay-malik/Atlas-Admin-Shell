import { toAuthUser } from './claims';

describe('toAuthUser', () => {
  const base = { sub: 'u-1', email: 'ada@atlas.dev' };

  it('reads an admin role from app_metadata', () => {
    expect(toAuthUser({ ...base, app_metadata: { atlas_role: 'admin' } })).toEqual({
      id: 'u-1',
      name: 'ada@atlas.dev',
      email: 'ada@atlas.dev',
      role: 'admin',
    });
  });

  it('reads a role from a custom access token hook claim', () => {
    expect(toAuthUser({ ...base, atlas_role: 'admin' })?.role).toBe('admin');
  });

  /**
   * The security-critical case. Supabase documents user_metadata as editable by
   * the user without any checks, so honouring it would let anyone self-promote.
   */
  it('IGNORES a role claimed in user_metadata', () => {
    const user = toAuthUser({ ...base, user_metadata: { atlas_role: 'admin' } });
    expect(user?.role).toBe('viewer');
  });

  /** `role` is the Postgres role — literally "authenticated" for everyone. */
  it('IGNORES the Postgres role claim', () => {
    expect(toAuthUser({ ...base, role: 'authenticated' })?.role).toBe('viewer');
    expect(toAuthUser({ ...base, role: 'admin' })?.role).toBe('viewer');
  });

  it('fails closed for anything unrecognised', () => {
    expect(toAuthUser({ ...base, app_metadata: { atlas_role: 'root' } })?.role).toBe('viewer');
    expect(toAuthUser({ ...base, app_metadata: { atlas_role: 42 } })?.role).toBe('viewer');
    expect(toAuthUser({ ...base, app_metadata: null })?.role).toBe('viewer');
    expect(toAuthUser(base)?.role).toBe('viewer');
  });

  it('prefers a full name but falls back to email, then id', () => {
    expect(toAuthUser({ ...base, app_metadata: { full_name: 'Ada Lovelace' } })?.name).toBe(
      'Ada Lovelace'
    );
    expect(toAuthUser(base)?.name).toBe('ada@atlas.dev');
    expect(toAuthUser({ sub: 'u-1' })?.name).toBe('u-1');
  });

  it('rejects claims with no subject', () => {
    expect(toAuthUser({ email: 'x@y.z' })).toBeNull();
    expect(toAuthUser({ sub: 42 })).toBeNull();
    expect(toAuthUser({})).toBeNull();
  });
});
