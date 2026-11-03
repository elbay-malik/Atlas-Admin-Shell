import { computed, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { flagToggled, toAtlasActor } from '@atlas/shared-contracts';
import { AtlasEventBus } from '@atlas/shared-event-bus';
import { setError, setFulfilled, setPending, withRequestStatus } from '@atlas/shared-util';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { entityConfig, setAllEntities, updateEntity, withEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { EMPTY, exhaustMap, mergeMap, pipe, tap } from 'rxjs';
import { FeatureFlag, FlagsApi } from './flags-api';

/** Flags are identified by their key, not a surrogate id. */
const flagsConfig = entityConfig({
  entity: type<FeatureFlag>(),
  selectId: (flag) => flag.key,
});

interface FlagsState {
  /** Keys whose write is in flight — one row can be busy while others are not. */
  pendingKeys: string[];
  /** The last confirmed toggle, kept so it can be announced and reversed. */
  lastToggle: { key: string; message: string } | null;
}

const initialState: FlagsState = { pendingKeys: [], lastToggle: null };

/**
 * The feature-flags domain store (ADR-0005: a store never crosses a federation
 * boundary — this one is provided on the remote's root route).
 *
 * `toggle` is optimistic: the row flips immediately, the key goes into
 * `pendingKeys`, and the API answer either confirms it (publishing
 * `flag.toggled` v1 on the shared bus so audit-logs can record it) or rolls the
 * row back with the failure message. Every API call is wrapped in `tapResponse`
 * INSIDE the flattening operator, because an error escaping an rxMethod
 * pipeline terminates it for the store's lifetime.
 */
export const FlagsStore = signalStore(
  withEntities(flagsConfig),
  withRequestStatus(),
  withState(initialState),
  withComputed(({ entities }) => ({
    enabledCount: computed(() => entities().filter((flag) => flag.enabled).length),
  })),
  withMethods(
    (
      store,
      api = inject(FlagsApi),
      bus = inject(AtlasEventBus),
      auth = inject(AtlasAuth)
    ) => ({
      load: rxMethod<void>(
        pipe(
          tap(() => patchState(store, setPending())),
          // exhaustMap: an impatient second Retry click must not race the first
          exhaustMap(() =>
            api.getFlags().pipe(
              tapResponse({
                next: (flags) =>
                  patchState(store, setAllEntities(flags, flagsConfig), setFulfilled()),
                error: (error: Error) => patchState(store, setError(error.message)),
              })
            )
          )
        )
      ),
      toggle: rxMethod<string>(
        // mergeMap: independent rows may be in flight at the same time
        pipe(
          mergeMap((key) => {
            // Read once, here: a session ending mid-write must not blank the
            // actor of a change it started, and with no user there is no write
            // at all, whatever a stale screen still offers.
            const actor = auth.user();
            if (!actor) {
              patchState(store, setError('Sign in to make changes.'));
              return EMPTY;
            }

            const flag = store.entityMap()[key];
            if (!flag) return EMPTY;
            // In-flight guard. The row stays focusable while its write is
            // pending (disabling it would throw keyboard focus to <body>), so
            // a double-activation has to be swallowed here instead.
            if (store.pendingKeys().includes(key)) return EMPTY;

            const enabled = !flag.enabled;
            patchState(
              store,
              updateEntity({ id: key, changes: { enabled } }, flagsConfig),
              (state) => ({ pendingKeys: [...state.pendingKeys, key] })
            );

            return api.setEnabled(key, enabled).pipe(
              tapResponse({
                next: () => {
                  // clear any error left by an earlier failed write, or the
                  // banner would outlive the failure for the whole session
                  patchState(store, setFulfilled(), {
                    lastToggle: {
                      key,
                      message: `${key} turned ${enabled ? 'on' : 'off'}.`,
                    },
                  });
                  bus.publish(
                    flagToggled(
                      { key, enabled },
                      { source: 'feature-flags', actor: toAtlasActor(actor) }
                    )
                  );
                },
                error: (error: Error) =>
                  patchState(
                    store,
                    updateEntity({ id: key, changes: { enabled: flag.enabled } }, flagsConfig),
                    setError(error.message)
                  ),
                finalize: () =>
                  patchState(store, (state) => ({
                    pendingKeys: state.pendingKeys.filter((pending) => pending !== key),
                  })),
              })
            );
          })
        )
      ),
    })
  ),
  // A second pass, because undo has to call the toggle defined above.
  withMethods((store) => ({
    /**
     * Reverses the last toggle by toggling again, not by patching state back.
     * The inverse goes through the same API call and publishes its own event,
     * so the audit trail records the undo as a real change — an operator
     * reading the log later needs to see that the flag went on and then off,
     * not an edit that silently vanished.
     */
    undoLastToggle(): void {
      const last = store.lastToggle();
      if (!last) return;
      patchState(store, { lastToggle: null });
      store.toggle(last.key);
    },
    dismissLastToggle(): void {
      patchState(store, { lastToggle: null });
    },
  })),
  withHooks({
    onInit: ({ load }) => load(),
  })
);
