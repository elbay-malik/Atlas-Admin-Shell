import { IamUser } from './iam-api';
import { RefusalContext, countActiveAdmins, refuseDeactivate, refuseRoleChange } from './iam-users.store';

/**
 * These are error prevention, not security. ADR-0011 is explicit that the edge
 * BFF is the authorization boundary and the client only hides things, and the
 * same invariants live there. They exist in the client because production runs
 * `apiMode: 'mock'`, so without them the console lets an administrator demote
 * themselves out of the screen they are standing in — which reads as a bug
 * rather than as a deliberate boundary.
 *
 * They are pure functions on purpose: the template disables a control with
 * them and the store refuses a write with them, and the two must never be able
 * to disagree.
 */
const user = (over: Partial<IamUser> = {}): IamUser => ({
  id: 'u1',
  name: 'Grace Hopper',
  email: 'grace@atlas.dev',
  role: 'admin',
  active: true,
  ...over,
});

const context = (over: Partial<RefusalContext> = {}): RefusalContext => ({
  actorId: 'u-actor',
  actorEmail: 'ada@atlas.dev',
  activeAdminCount: 2,
  ...over,
});

describe('who counts as yourself', () => {
  it('recognises you by id when the token has no email', () => {
    const self = user({ id: 'u-actor', email: 'someone@atlas.dev' });
    const noEmail = context({ actorEmail: '' });
    expect(refuseRoleChange(self, 'viewer', noEmail)).toMatch(/your own admin/);
    expect(refuseDeactivate(self, false, noEmail)).toMatch(/signed in with/);
  });

  it('does not treat a blank email as a match', () => {
    // Two missing addresses are not the same person.
    const other = user({ email: '' });
    const noEmail = context({ actorEmail: '' });
    expect(refuseRoleChange(other, 'viewer', noEmail)).toBeNull();
    expect(refuseDeactivate(other, false, noEmail)).toBeNull();
  });
});

describe('with nobody signed in', () => {
  const signedOut = context({ actorId: null, actorEmail: '' });

  it('refuses every direction of every change', () => {
    expect(refuseRoleChange(user(), 'viewer', signedOut)).toBe('Sign in to make changes.');
    expect(refuseRoleChange(user({ role: 'viewer' }), 'admin', signedOut)).toBe(
      'Sign in to make changes.'
    );
    expect(refuseDeactivate(user(), false, signedOut)).toBe('Sign in to make changes.');
    expect(refuseDeactivate(user({ active: false }), true, signedOut)).toBe(
      'Sign in to make changes.'
    );
  });
});

describe('refuseRoleChange', () => {
  it('allows demoting another admin while a second one remains', () => {
    expect(refuseRoleChange(user(), 'viewer', context())).toBeNull();
  });

  it('refuses demoting yourself, whatever the admin count', () => {
    const self = user({ email: 'ada@atlas.dev' });
    // Even with five admins: losing your own access mid-task is its own
    // failure, not a quorum question.
    expect(refuseRoleChange(self, 'viewer', context({ activeAdminCount: 5 }))).toMatch(/your own admin/);
  });

  it('refuses removing the last administrator', () => {
    expect(refuseRoleChange(user(), 'viewer', context({ activeAdminCount: 1 }))).toMatch(
      /last administrator/
    );
  });

  it('allows demoting a deactivated admin, who is not the last of anything', () => {
    // The false refusal: Grace deactivated, Ada the one active admin, and Grace's
    // role locked as "the last administrator".
    const deactivated = user({ active: false });
    expect(refuseRoleChange(deactivated, 'viewer', context({ activeAdminCount: 1 }))).toBeNull();
  });

  it('never blocks a promotion', () => {
    // The guard is about losing admin, not gaining it; blocking promotion would
    // make the last-admin state unescapable.
    const viewer = user({ role: 'viewer' });
    expect(refuseRoleChange(viewer, 'admin', context({ activeAdminCount: 1 }))).toBeNull();
  });

  it('ignores a change that does not touch admin at all', () => {
    expect(refuseRoleChange(user({ role: 'viewer' }), 'viewer', context({ activeAdminCount: 1 }))).toBeNull();
  });
});

describe('refuseDeactivate', () => {
  it('allows deactivating another user', () => {
    expect(refuseDeactivate(user({ role: 'viewer' }), false, context())).toBeNull();
  });

  it('refuses deactivating the account you are signed in with', () => {
    const self = user({ email: 'ada@atlas.dev', role: 'viewer' });
    expect(refuseDeactivate(self, false, context())).toMatch(/signed in with/);
  });

  it('refuses deactivating the last administrator', () => {
    expect(refuseDeactivate(user(), false, context({ activeAdminCount: 1 }))).toMatch(
      /last administrator/
    );
  });

  it('counts the same admins as the edge does', () => {
    const users = [
      user({ id: 'a' }),
      user({ id: 'b', active: false }),
      user({ id: 'c', role: 'viewer' }),
    ];
    expect(countActiveAdmins(users)).toBe(1);
  });

  it('never blocks reactivation', () => {
    // Activating cannot reduce access, so there is nothing to protect against.
    const self = user({ email: 'ada@atlas.dev', active: false });
    expect(refuseDeactivate(self, true, context({ activeAdminCount: 1 }))).toBeNull();
  });
});
