import { ATLAS_EVENT_FIXTURES, AtlasEvent, AtlasEventType } from '@atlas/shared-contracts';
import { UNMAPPED_TARGET, toAuditEntry } from './to-audit-entry';

const fixtures = Object.entries(ATLAS_EVENT_FIXTURES) as [string, AtlasEvent][];

describe('toAuditEntry', () => {
  /**
   * Walks the published contract catalogue: adding a (type, version) upstream
   * fails here until the mapping learns it, which is the point of the fixture
   * export in @atlas/shared-contracts.
   */
  it.each(fixtures)('maps the %s fixture to a specific row', (_key, event) => {
    const entry = toAuditEntry(event);
    expect(entry.id).toBe(event.id);
    expect(entry.at).toBe(event.occurredAt);
    expect(entry.actor).toBe(event.actor);
    expect(entry.source).toBe(event.source);
    // A resolved target is the signal that this (type, version) is actually
    // mapped — the generic fallback leaves it as UNMAPPED_TARGET. (Some actions
    // legitimately equal the event type, e.g. user.role.changed.)
    expect(entry.action).toBeTruthy();
    expect(entry.target).not.toBe(UNMAPPED_TARGET);
  });

  it('renders a flag toggle as enabled or disabled', () => {
    const on = ATLAS_EVENT_FIXTURES['flag.toggled.v1'];
    expect(toAuditEntry(on)).toMatchObject({ action: 'flag.enabled', target: 'bulk-export' });

    const off = { ...on, payload: { ...on.payload, enabled: false } };
    expect(toAuditEntry(off)).toMatchObject({ action: 'flag.disabled' });
  });

  it('carries the role transition as detail', () => {
    const entry = toAuditEntry(ATLAS_EVENT_FIXTURES['user.role.changed.v1']);
    expect(entry).toMatchObject({
      action: 'user.role.changed',
      target: 'alan@atlas.dev',
      detail: 'viewer -> admin',
    });
  });

  it('renders activation and deactivation distinctly', () => {
    const deactivated = ATLAS_EVENT_FIXTURES['user.status.changed.v1'];
    expect(toAuditEntry(deactivated).action).toBe('user.deactivated');
    const activated = { ...deactivated, payload: { ...deactivated.payload, active: true } };
    expect(toAuditEntry(activated).action).toBe('user.activated');
  });

  it('records a remote outage against the remote name', () => {
    expect(toAuditEntry(ATLAS_EVENT_FIXTURES['remote.unavailable.v1'])).toMatchObject({
      action: 'remote.unavailable',
      target: 'audit-logs',
    });
  });

  it('degrades to a generic row for a version it does not know, instead of throwing', () => {
    // a newer remote publishing flag.toggled v2 must never break an older trail
    const future = {
      ...ATLAS_EVENT_FIXTURES['flag.toggled.v1'],
      version: 2,
      payload: { key: 'bulk-export', enabled: true, rolloutPercent: 25 },
    } as unknown as AtlasEvent;

    const entry = toAuditEntry(future);
    expect(entry.action).toBe('flag.toggled');
    expect(entry.target).toBe(UNMAPPED_TARGET);
    expect(entry.id).toBe(ATLAS_EVENT_FIXTURES['flag.toggled.v1'].id);
  });

  it('degrades to a generic row for a type it has never heard of', () => {
    const unknown = {
      ...ATLAS_EVENT_FIXTURES['flag.toggled.v1'],
      type: 'tenant.provisioned' as AtlasEventType,
      payload: { tenant: 'acme' },
    } as unknown as AtlasEvent;

    expect(toAuditEntry(unknown)).toMatchObject({
      action: 'tenant.provisioned',
      target: UNMAPPED_TARGET,
    });
  });
});
