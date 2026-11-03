import { AtlasRole } from '@atlas/shared-contracts';
import { Principal } from './authz';
import { Store, record } from './data';

export interface Problem {
  status: number;
  title: string;
}

export type Handled = { body: unknown } | { problem: Problem };

const isProblem = (result: Handled): result is { problem: Problem } => 'problem' in result;
export { isProblem };

/**
 * Invariants the client structurally cannot enforce.
 *
 * The IAM screen shows an admin count, but that is a number on a page: two
 * admins demoting each other in separate tabs would each see a safe-looking
 * count. Only the server sees the whole picture, so only the server can refuse.
 */
function wouldRemoveLastAdmin(store: Store, userId: string): boolean {
  const admins = store.users.filter((u) => u.role === 'admin' && u.active);
  return admins.length <= 1 && admins.some((u) => u.id === userId);
}

export function listUsers(store: Store): Handled {
  return { body: { users: store.users } };
}

export function setUserRole(
  store: Store,
  principal: Principal,
  id: string,
  role: unknown
): Handled {
  if (role !== 'admin' && role !== 'viewer') {
    return { problem: { status: 400, title: 'role must be admin or viewer' } };
  }
  const user = store.users.find((u) => u.id === id);
  if (!user) return { problem: { status: 404, title: 'user not found' } };

  if (user.id === principal.sub && role !== 'admin') {
    return { problem: { status: 409, title: 'you cannot demote yourself' } };
  }
  if (role === 'viewer' && wouldRemoveLastAdmin(store, user.id)) {
    return { problem: { status: 409, title: 'the last admin cannot be demoted' } };
  }

  const previous: AtlasRole = user.role;
  if (previous === role) return { body: { user } }; // idempotent: no second audit row

  user.role = role;
  record(store, principal.email || principal.sub, 'user.role.changed', user.email, `${previous} to ${role}`);
  return { body: { user } };
}

export function setUserActive(
  store: Store,
  principal: Principal,
  id: string,
  active: unknown
): Handled {
  if (typeof active !== 'boolean') {
    return { problem: { status: 400, title: 'active must be a boolean' } };
  }
  const user = store.users.find((u) => u.id === id);
  if (!user) return { problem: { status: 404, title: 'user not found' } };

  if (user.id === principal.sub && !active) {
    return { problem: { status: 409, title: 'you cannot deactivate yourself' } };
  }
  if (!active && wouldRemoveLastAdmin(store, user.id)) {
    return { problem: { status: 409, title: 'the last admin cannot be deactivated' } };
  }

  if (user.active === active) return { body: { user } };
  user.active = active;
  record(
    store,
    principal.email || principal.sub,
    active ? 'user.activated' : 'user.deactivated',
    user.email
  );
  return { body: { user } };
}

export function listFlags(store: Store): Handled {
  return { body: { flags: store.flags } };
}

export function setFlag(store: Store, principal: Principal, key: string, enabled: unknown): Handled {
  if (typeof enabled !== 'boolean') {
    return { problem: { status: 400, title: 'enabled must be a boolean' } };
  }
  const flag = store.flags.find((f) => f.key === key);
  if (!flag) return { problem: { status: 404, title: 'flag not found' } };

  if (flag.enabled === enabled) return { body: { flag } };
  flag.enabled = enabled;
  record(
    store,
    principal.email || principal.sub,
    enabled ? 'flag.enabled' : 'flag.disabled',
    flag.key
  );
  return { body: { flag } };
}

/** `q` is untrusted input, so filtering happens here rather than being trusted from the client. */
export function listAudit(store: Store, query: string | null): Handled {
  const q = (query ?? '').trim().toLowerCase();
  const entries = q
    ? store.audit.filter(
        (e) =>
          e.actor.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q)
      )
    : store.audit;
  return { body: { entries } };
}
