import { AtlasRole } from '@atlas/shared-contracts';

/**
 * In-memory domain state, per isolate. A database is a later slice; what this
 * layer exists to prove now is the authorization boundary and the server-side
 * invariants, neither of which needs persistence to be real.
 */
export interface BffUser {
  id: string;
  name: string;
  email: string;
  role: AtlasRole;
  active: boolean;
}

export interface BffFlag {
  key: string;
  description: string;
  enabled: boolean;
  /** What flipping this reaches. The console asks for a second step when it is set. */
  blastRadius?: string;
}

export interface BffAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
}

export interface Store {
  users: BffUser[];
  flags: BffFlag[];
  audit: BffAuditEntry[];
}

export function seedStore(): Store {
  return {
    users: [
      { id: 'u-1', name: 'Ada Lovelace', email: 'ada@atlas.dev', role: 'admin', active: true },
      { id: 'u-2', name: 'Grace Hopper', email: 'grace@atlas.dev', role: 'admin', active: true },
      { id: 'u-3', name: 'Alan Turing', email: 'alan@atlas.dev', role: 'viewer', active: true },
      { id: 'u-4', name: 'Katherine Johnson', email: 'kj@atlas.dev', role: 'viewer', active: false },
    ],
    flags: [
      { key: 'new-dashboard', description: 'Next-gen dashboard layout', enabled: true },
      { key: 'bulk-export', description: 'CSV export for audit logs', enabled: false },
      {
        key: 'sso-enforced',
        description: 'Require SSO for all tenants',
        enabled: false,
        blastRadius: 'Changes sign-in for every tenant as soon as you confirm.',
      },
    ],
    audit: [],
  };
}

/**
 * Appends to the trail. The actor comes from the VERIFIED token, never from the
 * request body — a client-writable audit log is not an audit log, and the
 * browser-side event bus that feeds the audit screen today is display only.
 */
export function record(
  store: Store,
  actor: string,
  action: string,
  target: string,
  detail?: string
): BffAuditEntry {
  const entry: BffAuditEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    target,
    ...(detail === undefined ? {} : { detail }),
  };
  store.audit = [entry, ...store.audit];
  return entry;
}
