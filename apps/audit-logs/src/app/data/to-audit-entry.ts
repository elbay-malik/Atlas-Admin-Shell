import { AtlasEvent } from '@atlas/shared-contracts';
import { AuditEntry } from './audit-entry';

/** Target shown when an event carries no target this remote understands. */
export const UNMAPPED_TARGET = '—';

type AuditAction = Pick<AuditEntry, 'action' | 'target' | 'detail'>;

/**
 * Contract -> row. Deliberately total: a remote that ships a newer event
 * version than this build knows must never crash the audit trail, so an
 * unrecognised (type, version) degrades to a generic row instead of throwing
 * (ADR-0005 — consumers ignore unknown versions).
 *
 * `to-audit-entry.spec.ts` walks ATLAS_EVENT_FIXTURES, so publishing a new
 * (type, version) pair fails this remote's tests until the mapping below is
 * extended.
 */
export function toAuditEntry(event: AtlasEvent): AuditEntry {
  const action: AuditAction = mapKnown(event) ?? {
    action: event.type,
    target: UNMAPPED_TARGET,
  };
  return {
    id: event.id,
    at: event.occurredAt,
    actor: event.actor,
    source: event.source,
    ...action,
  };
}

function mapKnown(event: AtlasEvent): AuditAction | null {
  switch (event.type) {
    case 'flag.toggled':
      if (event.version === 1) {
        return {
          action: event.payload.enabled ? 'flag.enabled' : 'flag.disabled',
          target: event.payload.key,
        };
      }
      break;
    case 'user.role.changed':
      if (event.version === 1) {
        return {
          action: 'user.role.changed',
          target: event.payload.email,
          detail: `${event.payload.from} -> ${event.payload.to}`,
        };
      }
      break;
    case 'user.status.changed':
      if (event.version === 1) {
        return {
          action: event.payload.active ? 'user.activated' : 'user.deactivated',
          target: event.payload.email,
        };
      }
      break;
    case 'remote.unavailable':
      if (event.version === 1) {
        return { action: 'remote.unavailable', target: event.payload.remote };
      }
      break;
  }
  return null;
}
