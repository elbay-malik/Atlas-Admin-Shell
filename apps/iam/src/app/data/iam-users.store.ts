import { computed, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { AtlasRole, userRoleChanged, userStatusChanged } from '@atlas/shared-contracts';
import { AtlasEventBus } from '@atlas/shared-event-bus';
import { setError, setFulfilled, setPending, withRequestStatus } from '@atlas/shared-util';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { setAllEntities, updateEntity, withEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, exhaustMap, mergeMap, pipe, tap } from 'rxjs';
import { IamApi, IamUser } from './iam-api';

interface IamState {
  /** Ids whose write is in flight — one row can be busy while others are not. */
  pendingIds: string[];
}

const initialState: IamState = { pendingIds: [] };

/**
 * The IAM domain store (ADR-0005: a store never crosses a federation boundary —
 * this one is provided on the remote's root route).
 *
 * Both writes are optimistic: the row changes immediately and either the API
 * confirms it — publishing a versioned event on the shared bus so audit-logs
 * records it — or the row rolls back with the failure message. Every API call
 * is wrapped in `tapResponse` INSIDE the flattening operator, because an error
 * escaping an rxMethod pipeline terminates it for the store's lifetime.
 */
export const IamUsersStore = signalStore(
  withEntities<IamUser>(),
  withRequestStatus(),
  withState(initialState),
  withComputed(({ entities }) => ({
    adminCount: computed(() => entities().filter((user) => user.role === 'admin').length),
    activeCount: computed(() => entities().filter((user) => user.active).length),
  })),
  withMethods(
    (store, api = inject(IamApi), bus = inject(AtlasEventBus), auth = inject(AtlasAuth)) => {
      /** Who is making the change — the shell's auth singleton, across the boundary. */
      const actor = () => auth.user()?.email ?? 'system';

      const begin = (id: string) =>
        patchState(store, (state) => ({ pendingIds: [...state.pendingIds, id] }));

      const settle = (id: string) =>
        patchState(store, (state) => ({
          pendingIds: state.pendingIds.filter((pending) => pending !== id),
        }));

      return {
        loadUsers: rxMethod<void>(
          pipe(
            tap(() => patchState(store, setPending())),
            // exhaustMap: an impatient second Retry click must not race the first
            exhaustMap(() =>
              api.getUsers().pipe(
                tapResponse({
                  next: (users) => patchState(store, setAllEntities(users), setFulfilled()),
                  error: (error: Error) => patchState(store, setError(error.message)),
                })
              )
            )
          )
        ),

        changeRole: rxMethod<{ id: string; role: AtlasRole }>(
          // mergeMap: independent rows may be in flight at the same time
          pipe(
            mergeMap(({ id, role }) => {
              const user = store.entityMap()[id];
              if (!user || user.role === role) return EMPTY;

              const previous = user.role;
              patchState(store, updateEntity({ id, changes: { role } }));
              begin(id);

              return api.setRole(id, role).pipe(
                tapResponse({
                  next: () => {
                    patchState(store, setFulfilled());
                    bus.publish(
                      userRoleChanged(
                        { userId: id, email: user.email, from: previous, to: role },
                        { source: 'iam', actor: actor() }
                      )
                    );
                  },
                  error: (error: Error) =>
                    patchState(
                      store,
                      updateEntity({ id, changes: { role: previous } }),
                      setError(error.message)
                    ),
                  finalize: () => settle(id),
                })
              );
            })
          )
        ),

        setActive: rxMethod<{ id: string; active: boolean }>(
          pipe(
            mergeMap(({ id, active }) => {
              const user = store.entityMap()[id];
              if (!user || user.active === active) return EMPTY;

              patchState(store, updateEntity({ id, changes: { active } }));
              begin(id);

              return api.setActive(id, active).pipe(
                tapResponse({
                  next: () => {
                    patchState(store, setFulfilled());
                    bus.publish(
                      userStatusChanged(
                        { userId: id, email: user.email, active },
                        { source: 'iam', actor: actor() }
                      )
                    );
                  },
                  error: (error: Error) =>
                    patchState(
                      store,
                      updateEntity({ id, changes: { active: user.active } }),
                      setError(error.message)
                    ),
                  finalize: () => settle(id),
                })
              );
            })
          )
        ),
      };
    }
  ),
  withHooks({
    onInit: ({ loadUsers }) => loadUsers(),
  })
);
