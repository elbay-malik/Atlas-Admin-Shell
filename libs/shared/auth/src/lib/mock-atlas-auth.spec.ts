import { MockAtlasAuth } from './mock-atlas-auth';

describe('MockAtlasAuth', () => {
  let auth: MockAtlasAuth;

  beforeEach(() => {
    localStorage.clear();
    auth = new MockAtlasAuth();
  });

  it('starts unauthenticated', async () => {
    await auth.init();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('logs personas in and out', async () => {
    await auth.login('admin');
    expect(auth.user()?.role).toBe('admin');
    await auth.logout();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restores the persisted persona on init', async () => {
    await auth.login('viewer');
    const fresh = new MockAtlasAuth();
    await fresh.init();
    expect(fresh.user()?.role).toBe('viewer');
  });

  it('grants role access hierarchically', async () => {
    await auth.login('viewer');
    expect(auth.hasRole('viewer')).toBe(true);
    expect(auth.hasRole('admin')).toBe(false);
    await auth.login('admin');
    expect(auth.hasRole('viewer')).toBe(true);
    expect(auth.hasRole('admin')).toBe(true);
  });
});
