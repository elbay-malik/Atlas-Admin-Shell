import { signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AtlasAuth, AuthUser, MockAtlasAuth } from '@atlas/shared-auth';
import { AtlasEvent } from '@atlas/shared-contracts';
import { AtlasEventBus, provideAtlasEventBus } from '@atlas/shared-event-bus';
import { Subscription } from 'rxjs';
import { IamApi, IamMockApi } from './iam-api';
import { IamUsersStore } from './iam-users.store';

const GET_USERS_MS = 300;
const WRITE_MS = 200;

type Store = InstanceType<typeof IamUsersStore>;

interface Harness {
  store: Store;
  api: IamMockApi;
  published: AtlasEvent[];
  subscription: Subscription;
}

/** A real token with no email claim: `name` falls back to the id, `email` is ''. */
const NO_EMAIL: AuthUser = { id: '3f6c-91c6', name: '3f6c-91c6', email: '', role: 'admin' };
class NoEmailAuth extends MockAtlasAuth {
  override readonly user = signal<AuthUser | null>(NO_EMAIL).asReadonly();
}

function setup(auth: Type<AtlasAuth> = MockAtlasAuth): Harness {
  TestBed.configureTestingModule({
    providers: [
      provideAtlasEventBus(),
      { provide: AtlasAuth, useClass: auth },
      { provide: IamApi, useClass: IamMockApi },
      IamUsersStore,
    ],
  });
  const published: AtlasEvent[] = [];
  const subscription = TestBed.inject(AtlasEventBus)
    .all()
    .subscribe((event) => published.push(event));
  return { store: TestBed.inject(IamUsersStore), api: TestBed.inject(IamApi) as IamMockApi, published, subscription };
}

/** Signed in as the admin persona, with the initial load settled. */
async function loaded(): Promise<Harness> {
  const harness = setup();
  await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login('admin');
  await vi.advanceTimersByTimeAsync(GET_USERS_MS);
  return harness;
}

describe('IamUsersStore', () => {
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

  it('loads the directory on init', async () => {
    const { store } = track(setup());

    expect(store.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(GET_USERS_MS);

    expect(store.isFulfilled()).toBe(true);
    expect(store.entities()).toHaveLength(4);
    expect(store.adminCount()).toBe(2);
    expect(store.activeCount()).toBe(3);
  });

  it('surfaces a load failure and recovers on retry', async () => {
    const { store, api } = track(await loaded());

    api.failNext();
    store.loadUsers();
    await vi.advanceTimersByTimeAsync(GET_USERS_MS);
    expect(store.error()).toBe('Could not load users');

    store.loadUsers();
    await vi.advanceTimersByTimeAsync(GET_USERS_MS);
    expect(store.error()).toBeNull();
  });

  it('changes a role optimistically and publishes user.role.changed v1', async () => {
    const { store, published } = track(await loaded());

    store.changeRole({ id: 'u-3', role: 'admin' });

    expect(store.entityMap()['u-3'].role).toBe('admin'); // before the API answers
    expect(store.pendingIds()).toEqual(['u-3']);
    expect(published).toEqual([]);

    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.pendingIds()).toEqual([]);
    expect(store.adminCount()).toBe(3);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      type: 'user.role.changed',
      version: 1,
      source: 'iam',
      actor: 'ada@atlas.dev',
      payload: { userId: 'u-3', email: 'alan@atlas.dev', from: 'viewer', to: 'admin' },
    });
  });

  it('rolls a role change back and publishes nothing when the write fails', async () => {
    const { store, api, published } = track(await loaded());

    api.failNext();
    store.changeRole({ id: 'u-3', role: 'admin' });
    expect(store.entityMap()['u-3'].role).toBe('admin');

    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.entityMap()['u-3'].role).toBe('viewer');
    expect(store.error()).toBe('Could not make u-3 a admin');
    expect(store.pendingIds()).toEqual([]);
    expect(published).toEqual([]);
  });

  it('ignores a role change that would not change anything', async () => {
    const { store, published } = track(await loaded());

    store.changeRole({ id: 'u-1', role: 'admin' }); // already an admin
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(published).toEqual([]);
    expect(store.pendingIds()).toEqual([]);
  });

  it('deactivates optimistically and publishes user.status.changed v1', async () => {
    const { store, published } = track(await loaded());

    store.setActive({ id: 'u-2', active: false });
    expect(store.entityMap()['u-2'].active).toBe(false);

    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.activeCount()).toBe(2);
    expect(published[0]).toMatchObject({
      type: 'user.status.changed',
      version: 1,
      source: 'iam',
      payload: { userId: 'u-2', email: 'grace@atlas.dev', active: false },
    });
  });

  it('rolls an activation change back when the write fails', async () => {
    const { store, api, published } = track(await loaded());

    api.failNext();
    store.setActive({ id: 'u-4', active: true });
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.entityMap()['u-4'].active).toBe(false);
    expect(store.error()).toBe('Could not activate u-4');
    expect(published).toEqual([]);
  });

  it('refuses every write when nobody is signed in, and reports no success', async () => {
    const { store, published } = track(setup());
    await vi.advanceTimersByTimeAsync(GET_USERS_MS);

    store.setActive({ id: 'u-4', active: true });
    store.changeRole({ id: 'u-3', role: 'admin' });
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.entityMap()['u-4'].active).toBe(false);
    expect(store.entityMap()['u-3'].role).toBe('viewer');
    expect(store.lastChange()).toBeNull();
    expect(store.error()).toBe('Sign in to make changes.');
    expect(published).toEqual([]);
  });

  it('stops accepting writes the moment the session ends on a loaded screen', async () => {
    const { store, published } = track(await loaded());

    await TestBed.inject(AtlasAuth).logout();
    store.setActive({ id: 'u-3', active: false });
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.entityMap()['u-3'].active).toBe(true);
    expect(store.lastChange()).toBeNull();
    expect(published).toEqual([]);
  });

  it('keeps the actor of a write that a session end interrupts', async () => {
    const { store, published } = track(await loaded());

    store.setActive({ id: 'u-3', active: false });
    await TestBed.inject(AtlasAuth).logout();
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(published[0].actor).toBe('ada@atlas.dev');
  });

  it('names the user id as the actor when the token has no email', async () => {
    const { store, published } = track(setup(NoEmailAuth));
    await vi.advanceTimersByTimeAsync(GET_USERS_MS);

    store.setActive({ id: 'u-3', active: false });
    store.changeRole({ id: 'u-4', role: 'admin' });
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    // Blank was the bug: isAtlasEvent rejects an event with no actor.
    expect(published.map((event) => event.actor)).toEqual([NO_EMAIL.id, NO_EMAIL.id]);
  });

  it('clears a stale error once a later write succeeds', async () => {
    const { store, api } = track(await loaded());

    api.failNext();
    store.changeRole({ id: 'u-3', role: 'admin' });
    await vi.advanceTimersByTimeAsync(WRITE_MS);
    expect(store.error()).not.toBeNull();

    store.setActive({ id: 'u-4', active: true });
    await vi.advanceTimersByTimeAsync(WRITE_MS);

    expect(store.error()).toBeNull();
    expect(store.isFulfilled()).toBe(true);
  });

  it('tracks two rows independently while both are in flight', async () => {
    const { store } = track(await loaded());

    store.changeRole({ id: 'u-3', role: 'admin' });
    store.setActive({ id: 'u-4', active: true });
    expect(store.pendingIds()).toEqual(['u-3', 'u-4']);

    await vi.advanceTimersByTimeAsync(WRITE_MS);
    expect(store.pendingIds()).toEqual([]);
  });
});
