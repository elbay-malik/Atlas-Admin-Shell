import { TestBed } from '@angular/core/testing';
import { ATLAS_EVENT_FIXTURES, flagToggled } from '@atlas/shared-contracts';
import { AtlasEventBus, provideAtlasEventBus } from '@atlas/shared-event-bus';
import { AuditApi, AuditMockApi, auditSeed } from './audit-api';
import { AuditEntry, formatWhen } from './audit-entry';
import { AuditStore, filterEntries } from './audit.store';

const GET_EVENTS_MS = 300;

/** Configures the module but does NOT create the store, so the bus can be seeded first. */
function configure(): AtlasEventBus {
  TestBed.configureTestingModule({
    providers: [provideAtlasEventBus(), { provide: AuditApi, useClass: AuditMockApi }, AuditStore],
  });
  return TestBed.inject(AtlasEventBus);
}

describe('AuditStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads the seeded trail on init, newest first', async () => {
    configure();
    const store = TestBed.inject(AuditStore);

    expect(store.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(GET_EVENTS_MS);

    expect(store.isFulfilled()).toBe(true);
    const timestamps = store.filtered().map((entry) => Date.parse(entry.at));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    expect(store.filtered().length).toBeGreaterThan(0);
  });

  it('prepends events published while it is open', async () => {
    const bus = configure();
    const store = TestBed.inject(AuditStore);
    await vi.advanceTimersByTimeAsync(GET_EVENTS_MS);

    bus.publish(ATLAS_EVENT_FIXTURES['flag.toggled.v1']);

    const row = store.entities().find((entry) => entry.id === ATLAS_EVENT_FIXTURES['flag.toggled.v1'].id);
    expect(row).toMatchObject({ action: 'flag.enabled', target: 'bulk-export', source: 'feature-flags' });
  });

  /**
   * The late-subscriber contract: the audit remote is loaded on demand, so a
   * flag toggled minutes earlier in another remote must still land in the trail.
   */
  it('replays events published before the remote was even loaded', async () => {
    const bus = configure();
    bus.publish(ATLAS_EVENT_FIXTURES['flag.toggled.v1']);
    bus.publish(ATLAS_EVENT_FIXTURES['user.role.changed.v1']);

    const store = TestBed.inject(AuditStore); // store created AFTER the events
    await vi.advanceTimersByTimeAsync(GET_EVENTS_MS);

    const ids = store.entities().map((entry) => entry.id);
    expect(ids).toContain(ATLAS_EVENT_FIXTURES['flag.toggled.v1'].id);
    expect(ids).toContain(ATLAS_EVENT_FIXTURES['user.role.changed.v1'].id);
  });

  it('does not duplicate an event delivered by both replay and the live stream', async () => {
    const bus = configure();
    bus.publish(ATLAS_EVENT_FIXTURES['flag.toggled.v1']);
    const store = TestBed.inject(AuditStore);
    await vi.advanceTimersByTimeAsync(GET_EVENTS_MS);

    bus.publish(ATLAS_EVENT_FIXTURES['flag.toggled.v1']);

    const matching = store
      .entities()
      .filter((entry) => entry.id === ATLAS_EVENT_FIXTURES['flag.toggled.v1'].id);
    expect(matching).toHaveLength(1);
  });

  it('keeps live rows that arrived before the backend response', async () => {
    const bus = configure();
    const store = TestBed.inject(AuditStore);
    bus.publish(ATLAS_EVENT_FIXTURES['flag.toggled.v1']); // lands mid-flight

    await vi.advanceTimersByTimeAsync(GET_EVENTS_MS); // load resolves last

    expect(store.entities().map((e) => e.id)).toContain(
      ATLAS_EVENT_FIXTURES['flag.toggled.v1'].id
    );
  });

  it('filters case-insensitively across actor, action and target', async () => {
    const bus = configure();
    const store = TestBed.inject(AuditStore);
    await vi.advanceTimersByTimeAsync(GET_EVENTS_MS);
    bus.publish(
      flagToggled(
        { key: 'sso-enforced', enabled: true },
        { source: 'feature-flags', actor: 'grace@atlas.dev', id: 'live-1' }
      )
    );

    store.setQuery('SSO-ENFORCED');
    expect(store.filtered().map((e) => e.id)).toEqual(['live-1']);

    store.setQuery('grace');
    expect(store.filtered().every((e) => e.actor.includes('grace'))).toBe(true);

    store.setQuery('   ');
    expect(store.filtered().length).toBeGreaterThan(1);
  });
});

describe('formatWhen', () => {
  it('names the zone', () => {
    expect(formatWhen('2026-07-08T09:12:45.000Z')).toBe('2026-07-08 09:12 UTC');
  });

  it('converts an offset rather than mislabelling it', () => {
    expect(formatWhen('2026-07-08T11:12:00+02:00')).toBe('2026-07-08 09:12 UTC');
  });

  it('shows a value it cannot parse as it came', () => {
    expect(formatWhen('yesterday')).toBe('yesterday');
  });
});

describe('auditSeed', () => {
  const NOW = Date.parse('2026-11-04T10:30:20.000Z');

  it('dates every row before the load, on a whole minute, and within the last day', () => {
    for (const { at } of auditSeed(NOW)) {
      const time = Date.parse(at);
      expect(time).toBeLessThan(NOW);
      expect(time).toBeGreaterThan(NOW - 24 * 60 * 60 * 1000);
      expect(time % 60_000).toBe(0);
    }
  });

  it('keeps its rows seeded and its ids stable, so a retry cannot duplicate them', () => {
    const rows = auditSeed(NOW);
    expect(rows.every((row) => row.source === 'seed')).toBe(true);
    expect(auditSeed(NOW + 3_600_000).map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });
});

describe('filterEntries', () => {
  const seed: AuditEntry = {
    id: 'a',
    at: '2026-07-08T09:12:00.000Z',
    actor: 'ada@atlas.dev',
    action: 'user.role.changed',
    target: 'alan@atlas.dev',
    detail: 'viewer to admin',
    source: 'seed',
  };
  const live: AuditEntry = {
    id: 'b',
    at: '2025-01-02T03:04:00.000Z',
    actor: 'grace@atlas.dev',
    action: 'flag.toggled',
    target: 'new-dashboard',
    source: 'iam',
  };
  const ids = (query: string) => filterEntries([seed, live], query).map((entry) => entry.id);

  it('finds a date as the row shows it, and as its title holds it', () => {
    expect(ids('2026')).toEqual(['a']);
    expect(ids('2026-07-08 09:12')).toEqual(['a']);
    expect(ids('2026-07-08T09')).toEqual(['a']);
  });

  it('finds the rows wearing the live badge, and only those', () => {
    expect(ids('live')).toEqual(['b']);
    expect(ids('LIVE')).toEqual(['b']);
  });

  it('searches the detail text', () => {
    expect(ids('viewer to admin')).toEqual(['a']);
  });

  it('still searches actor, action and target, and keeps all on a blank filter', () => {
    expect(ids('grace')).toEqual(['b']);
    expect(ids('role.changed')).toEqual(['a']);
    expect(ids('new-dash')).toEqual(['b']);
    expect(ids('  ')).toEqual(['a', 'b']);
  });
});
