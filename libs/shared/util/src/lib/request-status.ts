import { Signal, computed } from '@angular/core';
import { signalStoreFeature, withComputed, withState } from '@ngrx/signals';

/**
 * The async lifecycle every domain store shares. `{ error }` carries the
 * message rather than a boolean so a failed load can explain itself in the UI.
 */
export type RequestStatus = 'idle' | 'pending' | 'fulfilled' | { error: string };

export interface RequestStatusState {
  requestStatus: RequestStatus;
}

export interface RequestStatusComputed {
  isPending: Signal<boolean>;
  isFulfilled: Signal<boolean>;
  error: Signal<string | null>;
}

/**
 * Adds `requestStatus` plus the derived `isPending`/`isFulfilled`/`error`
 * signals to a signalStore. Composed by every domain store so loading and
 * error UI look and behave the same across remotes (ADR-0005).
 */
export function withRequestStatus() {
  return signalStoreFeature(
    withState<RequestStatusState>({ requestStatus: 'idle' }),
    withComputed(({ requestStatus }) => ({
      isPending: computed(() => requestStatus() === 'pending'),
      isFulfilled: computed(() => requestStatus() === 'fulfilled'),
      error: computed(() => {
        const status = requestStatus();
        return typeof status === 'object' ? status.error : null;
      }),
    }))
  );
}

/** patchState updaters — `patchState(store, setPending())`. */
export function setPending(): RequestStatusState {
  return { requestStatus: 'pending' };
}

export function setFulfilled(): RequestStatusState {
  return { requestStatus: 'fulfilled' };
}

export function setError(error: string): RequestStatusState {
  return { requestStatus: { error } };
}

/** Narrowing helper for templates and tests. */
export function isRequestError(status: RequestStatus): status is { error: string } {
  return typeof status === 'object';
}
