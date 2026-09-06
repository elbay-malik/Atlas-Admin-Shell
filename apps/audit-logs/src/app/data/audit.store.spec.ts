import { TestBed } from '@angular/core/testing';
import { ATLAS_EVENT_FIXTURES, flagToggled } from '@atlas/shared-contracts';
import { AtlasEventBus, provideAtlasEventBus } from '@atlas/shared-event-bus';
import { AuditApi, AuditMockApi } from './audit-api';
import { AuditStore } from './audit.store';

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
