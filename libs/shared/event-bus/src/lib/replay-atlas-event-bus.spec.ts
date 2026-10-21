import { TestBed } from '@angular/core/testing';
import {
  ATLAS_EVENT_FIXTURES,
  AtlasEvent,
  flagToggled,
  userRoleChanged,
} from '@atlas/shared-contracts';
import { firstValueFrom, toArray } from 'rxjs';
import { ATLAS_EVENT_BUS_CONFIG, AtlasEventBus } from './atlas-event-bus';
import { provideAtlasEventBus } from './provide-atlas-event-bus';

const flag = ATLAS_EVENT_FIXTURES['flag.toggled.v1'];
const role = ATLAS_EVENT_FIXTURES['user.role.changed.v1'];

function makeBus(bufferSize?: number): AtlasEventBus {
  TestBed.configureTestingModule({
    providers: [provideAtlasEventBus(bufferSize === undefined ? {} : { bufferSize })],
  });
  return TestBed.inject(AtlasEventBus);
}

describe('ReplayAtlasEventBus', () => {
  it('defaults to a 200-event buffer', () => {
    makeBus();
    expect(TestBed.inject(ATLAS_EVENT_BUS_CONFIG).bufferSize).toBe(200);
  });

  it('records published events in history, oldest first', () => {
    const bus = makeBus();
    bus.publish(flag);
    bus.publish(role);
    expect(bus.history()).toEqual([flag, role]);
  });

  it('rejects a malformed event', () => {
    const bus = makeBus();
    const broken = { ...flag, payload: { key: 'k' } } as unknown as AtlasEvent;
    expect(() => bus.publish(broken)).toThrow(/Invalid Atlas event: flag\.toggled/);
    expect(bus.history()).toEqual([]);
  });

  it('trims the buffer to bufferSize, keeping the newest', () => {
    const bus = makeBus(2);
    const events = [1, 2, 3].map((n) =>
      flagToggled(
        { key: `flag-${n}`, enabled: true },
        { source: 'feature-flags', actor: 'ada@atlas.dev', id: `id-${n}`, occurredAt: flag.occurredAt }
      )
    );
    events.forEach((e) => bus.publish(e));
    expect(bus.history().map((e) => e.id)).toEqual(['id-2', 'id-3']);
  });

  it('streams live events filtered by a single type', async () => {
    const bus = makeBus();
    const received = firstValueFrom(bus.on('flag.toggled'));
    bus.publish(role);
    bus.publish(flag);
    expect(await received).toEqual(flag);
  });

  it('streams live events filtered by an array of types', async () => {
    const bus = makeBus();
    const received = firstValueFrom(bus.on(['user.role.changed', 'user.status.changed']));
    bus.publish(flag);
    bus.publish(role);
    expect(await received).toEqual(role);
  });

  it('replays matching history to a late subscriber before live events', async () => {
    const bus = makeBus();
    bus.publish(flag);
    bus.publish(role);

    const seen: AtlasEvent[] = [];
    const sub = bus.on('flag.toggled', { replay: true }).subscribe((e) => seen.push(e));
    expect(seen).toEqual([flag]); // replayed synchronously on subscribe

    const later = flagToggled(
      { key: 'sso-enforced', enabled: false },
      { source: 'feature-flags', actor: 'ada@atlas.dev' }
    );
    bus.publish(later);
    expect(seen).toEqual([flag, later]);
    sub.unsubscribe();
  });

  it('does not replay history without the replay option', () => {
    const bus = makeBus();
    bus.publish(flag);
    const seen: AtlasEvent[] = [];
    const sub = bus.on('flag.toggled').subscribe((e) => seen.push(e));
    expect(seen).toEqual([]);
    sub.unsubscribe();
  });

  it('all() streams every type and replays the whole history', async () => {
    const bus = makeBus();
    bus.publish(flag);
    const collected = firstValueFrom(bus.all({ replay: true }).pipe(toArray()));
    bus.publish(role);
    bus.publish(
      userRoleChanged(role.payload, { source: 'iam', actor: 'grace@atlas.dev', id: 'id-x' })
    );
    TestBed.inject(AtlasEventBus); // no-op, keeps the instance alive
    (bus as unknown as { live: { complete(): void } }).live.complete();
    expect((await collected).map((e) => e.id)).toEqual([flag.id, role.id, 'id-x']);
  });

  /**
   * `slice(-n)` cannot express "keep nothing": -0 === 0 in JavaScript, so
   * slice(-0) returns the whole array. A bufferSize of 0 — the one value that
   * reads as "disable replay" — therefore used to make the buffer UNBOUNDED,
   * growing for the lifetime of the page. The opposite of what it asks for,
   * and the failure direction that matters for a memory bound.
   */
  describe('buffer bounds', () => {
    it('keeps nothing at bufferSize 0, rather than everything', () => {
      const bus = makeBus(0);
      bus.publish(flag);
      bus.publish(role);

      expect(bus.history()).toEqual([]);
    });

    it('replays nothing to a late subscriber at bufferSize 0', () => {
      const bus = makeBus(0);
      bus.publish(flag);
      const seen: AtlasEvent[] = [];
      const sub = bus.all({ replay: true }).subscribe((e) => seen.push(e));

      expect(seen).toEqual([]);
      sub.unsubscribe();
    });

    it('keeps only the newest N', () => {
      const bus = makeBus(1);
      bus.publish(flag);
      bus.publish(role);

      expect(bus.history().map((e) => e.id)).toEqual([role.id]);
    });

    it('clamps a negative bufferSize towards keeping less, never everything', () => {
      const bus = makeBus(-5);
      bus.publish(flag);
      bus.publish(role);

      expect(bus.history()).toEqual([]);
    });

    it('does not keep a fractional extra event', () => {
      const bus = makeBus(1.9);
      bus.publish(flag);
      bus.publish(role);

      expect(bus.history().map((e) => e.id)).toEqual([role.id]);
    });
  });
});
