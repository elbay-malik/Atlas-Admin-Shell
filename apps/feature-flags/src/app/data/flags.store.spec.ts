import { signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AtlasAuth, AuthUser, MockAtlasAuth } from '@atlas/shared-auth';
import { AtlasEvent } from '@atlas/shared-contracts';
import { AtlasEventBus, provideAtlasEventBus } from '@atlas/shared-event-bus';
import { Subscription } from 'rxjs';
import { FlagsApi, FlagsMockApi } from './flags-api';
import { FlagsStore } from './flags.store';

const GET_FLAGS_MS = 300;
const SET_ENABLED_MS = 200;

type Store = InstanceType<typeof FlagsStore>;

interface Harness {
  store: Store;
  api: FlagsMockApi;
  bus: AtlasEventBus;
  published: AtlasEvent[];
  subscription: Subscription;
}

/** A real token with no email claim: `name` falls back to the id, `email` is ''. */
const NO_EMAIL: AuthUser = { id: '3f6c-91c6', name: '3f6c-91c6', email: '', role: 'admin' };
class NoEmailAuth extends MockAtlasAuth {
  override readonly user = signal<AuthUser | null>(NO_EMAIL).asReadonly();
}

/** Builds the store with the real API + bus; onInit's load() is left in flight. */
function setup(auth: Type<AtlasAuth> = MockAtlasAuth): Harness {
  TestBed.configureTestingModule({
    providers: [
      provideAtlasEventBus(),
      { provide: AtlasAuth, useClass: auth },
      { provide: FlagsApi, useClass: FlagsMockApi },
      FlagsStore,
    ],
  });

  const bus = TestBed.inject(AtlasEventBus);
  const published: AtlasEvent[] = [];
  const subscription = bus.all().subscribe((event) => published.push(event));

  return { store: TestBed.inject(FlagsStore), api: TestBed.inject(FlagsApi) as FlagsMockApi, bus, published, subscription };
}

/** Signed in as the admin persona, with the initial load settled. */
async function loaded(): Promise<Harness> {
  const harness = setup();
  await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');
  await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
  return harness;
}

describe('FlagsStore', () => {
  let subscriptions: Subscription[];

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    subscriptions = [];
  });

  afterEach(() => {
    subscriptions.forEach((s) => s.unsubscribe());
    vi.useRealTimers();
    localStorage.clear();
  });

  function track(harness: Harness): Harness {
    subscriptions.push(harness.subscription);
    return harness;
  }

  it('loads the seed flags on init', async () => {
    const { store } = track(setup());

    expect(store.isPending()).toBe(true);
    expect(store.entities()).toEqual([]);

    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);

    expect(store.isFulfilled()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.entities().map((flag) => flag.key)).toEqual([
      'new-dashboard',
      'bulk-export',
      'sso-enforced',
    ]);
    expect(store.enabledCount()).toBe(1);
  });

  it('surfaces a load failure and recovers on a retry', async () => {
    const { store, api } = track(await loaded());

    api.failNext();
    store.load();
    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
    expect(store.error()).toBe('Could not load feature flags');

    store.load();
    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
    expect(store.error()).toBeNull();
    expect(store.isFulfilled()).toBe(true);
  });

  it('flips the row optimistically and keeps the key pending until the API answers', async () => {
    const { store, published } = track(await loaded());

    store.toggle('bulk-export');

    // flipped before the API settles — that is what "optimistic" means
    expect(store.entityMap()['bulk-export'].enabled).toBe(true);
    expect(store.pendingKeys()).toEqual(['bulk-export']);
    expect(published).toEqual([]);

    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    expect(store.entityMap()['bulk-export'].enabled).toBe(true);
    expect(store.pendingKeys()).toEqual([]);
    expect(store.enabledCount()).toBe(2);
  });

  it('publishes exactly one flag.toggled v1 carrying the acting user', async () => {
    const { store, published } = track(await loaded());

    store.toggle('bulk-export');
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      type: 'flag.toggled',
      version: 1,
      source: 'feature-flags',
      actor: 'ada@atlas.dev',
      payload: { key: 'bulk-export', enabled: true },
    });
  });

  it('refuses a toggle when nobody is signed in, and reports no success', async () => {
    const { store, published } = track(setup());
    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
    const before = store.entityMap()['sso-enforced'].enabled;

    store.toggle('sso-enforced');
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    expect(store.entityMap()['sso-enforced'].enabled).toBe(before);
    expect(store.lastToggle()).toBeNull();
    expect(store.error()).toBe('Sign in to make changes.');
    expect(published).toEqual([]);
  });

  it('keeps the actor of a toggle that a session end interrupts', async () => {
    const { store, published } = track(await loaded());

    store.toggle('bulk-export');
    await TestBed.inject(AtlasAuth).logout();
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    expect(published[0].actor).toBe('ada@atlas.dev');
  });

  it('names the user id as the actor when the token has no email', async () => {
    const { store, published } = track(setup(NoEmailAuth));
    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);

    store.toggle('bulk-export');
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    // Blank was the bug: isAtlasEvent rejects an event with no actor.
    expect(published[0].actor).toBe(NO_EMAIL.id);
  });

  it('rolls the row back, records the error and publishes nothing when the write fails', async () => {
    const { store, api, published } = track(await loaded());

    api.failNext();
    store.toggle('new-dashboard');

    expect(store.entityMap()['new-dashboard'].enabled).toBe(false);
    expect(store.pendingKeys()).toEqual(['new-dashboard']);

    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    expect(store.entityMap()['new-dashboard'].enabled).toBe(true);
    expect(store.error()).toBe('Could not turn "new-dashboard" off');
    expect(store.pendingKeys()).toEqual([]);
    expect(published).toEqual([]);
  });

  it('clears a stale error once a later write succeeds', async () => {
    const { store, api } = track(await loaded());

    api.failNext();
    store.toggle('new-dashboard');
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
    expect(store.error()).toBe('Could not turn "new-dashboard" off');

    store.toggle('bulk-export');
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    // otherwise the banner outlives the failure for the whole session
    expect(store.error()).toBeNull();
    expect(store.isFulfilled()).toBe(true);
  });

  it('tracks several rows independently while they are in flight', async () => {
    const { store } = track(await loaded());

    store.toggle('bulk-export');
    store.toggle('sso-enforced');

    expect(store.pendingKeys()).toEqual(['bulk-export', 'sso-enforced']);

    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

    expect(store.pendingKeys()).toEqual([]);
    expect(store.enabledCount()).toBe(3);
  });

  describe('undo', () => {
    it('stops offering Undo once undone, and says the undo happened', async () => {
      const { store, published } = track(await loaded());

      store.toggle('bulk-export');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      expect(store.lastToggle()?.undoable).toBe(true);

      store.undoLastToggle();
      expect(store.lastToggle()).toBeNull();
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

      expect(store.entityMap()['bulk-export'].enabled).toBe(false);
      expect(store.lastToggle()).toMatchObject({
        message: 'Undone: bulk-export turned on.',
        undoable: false,
      });
      // The undo is a real change in the audit trail.
      expect(published).toHaveLength(2);

      // Nothing happens if something asks again.
      store.undoLastToggle();
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      expect(published).toHaveLength(2);
    });

    it('keeps the offer when the undo fails, because the toggle still stands', async () => {
      const { store, api } = track(await loaded());

      store.toggle('bulk-export');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      const offer = store.lastToggle();

      api.failNext();
      store.undoLastToggle();
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);

      expect(store.entityMap()['bulk-export'].enabled).toBe(true);
      expect(store.lastToggle()).toEqual(offer);
    });

    it('does not lose the offer to a write already in flight on that row', async () => {
      const { store } = track(await loaded());

      store.toggle('bulk-export');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      store.toggle('bulk-export');

      store.undoLastToggle();
      expect(store.lastToggle()).not.toBeNull();
    });

    it('records which earlier Undo a toggle of another flag replaced', async () => {
      const { store } = track(await loaded());

      store.toggle('bulk-export');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      expect(store.lastToggle()?.supersedes).toBeNull();

      store.toggle('new-dashboard');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      expect(store.lastToggle()?.supersedes).toBe('bulk-export turned on.');

      // The same flag again reverses it directly, so nothing is lost.
      store.toggle('new-dashboard');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      expect(store.lastToggle()?.supersedes).toBeNull();
    });

    it('does not claim to replace an Undo that had already expired', async () => {
      const { store } = track(await loaded());

      store.toggle('bulk-export');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      store.dismissLastToggle();

      store.toggle('new-dashboard');
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      expect(store.lastToggle()?.supersedes).toBeNull();
    });
  });
});
