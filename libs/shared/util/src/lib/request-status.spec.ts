// signalStore is an @Injectable class; this plain-TS lib's vitest runs outside the
// Angular CLI, so JIT needs the compiler loaded before the store class is created.
import '@angular/compiler';
import { Injector } from '@angular/core';
import { patchState, signalStore } from '@ngrx/signals';
import {
  isRequestError,
  setError,
  setFulfilled,
  setPending,
  withRequestStatus,
} from './request-status';

const Store = signalStore({ protectedState: false }, withRequestStatus());

function createStore() {
  return Injector.create({ providers: [{ provide: Store }] }).get(Store);
}

describe('withRequestStatus', () => {
  it('starts idle with no error', () => {
    const store = createStore();
    expect(store.requestStatus()).toBe('idle');
    expect(store.isPending()).toBe(false);
    expect(store.isFulfilled()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('tracks the pending -> fulfilled happy path', () => {
    const store = createStore();
    patchState(store, setPending());
    expect(store.isPending()).toBe(true);
    expect(store.isFulfilled()).toBe(false);
    patchState(store, setFulfilled());
    expect(store.isPending()).toBe(false);
    expect(store.isFulfilled()).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('exposes the failure message and clears it on the next attempt', () => {
    const store = createStore();
    patchState(store, setError('remote exploded'));
    expect(store.error()).toBe('remote exploded');
    expect(store.isPending()).toBe(false);
    expect(store.isFulfilled()).toBe(false);
    patchState(store, setPending());
    expect(store.error()).toBeNull();
  });
});

describe('request-status updaters', () => {
  it('produce plain patchState payloads', () => {
    expect(setPending()).toEqual({ requestStatus: 'pending' });
    expect(setFulfilled()).toEqual({ requestStatus: 'fulfilled' });
    expect(setError('boom')).toEqual({ requestStatus: { error: 'boom' } });
  });

  it('isRequestError narrows the union', () => {
    expect(isRequestError('idle')).toBe(false);
    expect(isRequestError({ error: 'boom' })).toBe(true);
  });
});
