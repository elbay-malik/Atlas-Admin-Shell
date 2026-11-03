import { computed, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { AtlasRole, toAtlasActor, userRoleChanged, userStatusChanged } from '@atlas/shared-contracts';
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

/** The last write, kept so it can be announced and reversed. */
interface LastChange {
  id: string;
  message: string;
  /** The value to restore — exactly one of these is set. */
  role?: AtlasRole;
  active?: boolean;
}

interface IamState {
  /** Ids whose write is in flight — one row can be busy while others are not. */
  pendingIds: string[];
  lastChange: LastChange | null;
}

const initialState: IamState = { pendingIds: [], lastChange: null };

/**
 * Refusals the console enforces so an administrator cannot lock themselves, or
 * everyone, out of the platform.
 *
 * These are ERROR PREVENTION, not security. ADR-0011 is unambiguous: the edge
 * BFF is the authorization boundary and the client only hides things. The same
 * invariants live there, and they are what actually hold — these exist because
 * production currently runs `apiMode: 'mock'`, so without them the demo lets an
 * admin demote themselves out of the screen they are standing in, which reads
 * as a bug rather than as a deliberate boundary.
 */
export interface RefusalContext {
  /** The signed-in user's id, or null when nobody is signed in. */
  actorId: string | null;
  /** '' when the identity project mints no email claim. */
  actorEmail: string;
  adminCount: number;
}

export const SIGNED_OUT_REFUSAL = 'Sign in to make changes.';

/**
 * Id first. Email is also checked because the mock directory's ids are its own,
 * not the signed-in user's, and only when non-empty: without that, an account
 * with no email claim would match every directory row with a blank address.
 */
function isSelf(user: IamUser, context: RefusalContext): boolean {
  return (
    user.id === context.actorId || (context.actorEmail !== '' && user.email === context.actorEmail)
  );
}

export function refuseRoleChange(
  user: IamUser,
  role: AtlasRole,
  context: RefusalContext
): string | null {
  if (context.actorId === null) return SIGNED_OUT_REFUSAL;
  if (user.role !== 'admin' || role === 'admin') return null;
  if (isSelf(user, context)) {
    return 'You cannot remove your own admin role — ask another administrator.';
  }
  if (context.adminCount <= 1) {
    return `${user.name} is the last administrator; promote someone else first.`;
  }
  return null;
}

export function refuseDeactivate(
  user: IamUser,
  active: boolean,
  context: RefusalContext
): string | null {
  if (context.actorId === null) return SIGNED_OUT_REFUSAL;
  if (active) return null;
  if (isSelf(user, context)) {
    return 'You cannot deactivate the account you are signed in with.';
  }
  if (user.role === 'admin' && context.adminCount <= 1) {
    return `${user.name} is the last administrator; promote someone else first.`;
  }
  return null;
}

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
      const begin = (id: string) =>
        patchState(store, (state) => ({ pendingIds: [...state.pendingIds, id] }));

      const settle = (id: string) =>
        patchState(store, (state) => ({
          pendingIds: state.pendingIds.filter((pending) => pending !== id),
        }));

      /** Context both refusals need, read fresh at the moment of the write. */
      const guardContext = (): RefusalContext => ({
        actorId: auth.user()?.id ?? null,
        actorEmail: auth.user()?.email ?? '',
        adminCount: store.entities().filter((u) => u.role === 'admin' && u.active).length,
      });

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
              // Who is making the change, from the shell's auth singleton. Read
              // once, here: a session ending mid-write must not blank the actor
              // of a change that session started, and with no user there is no
              // write at all, whatever a stale screen still offers.
              const actor = auth.user();
              if (!actor) {
                patchState(store, setError(SIGNED_OUT_REFUSAL));
                return EMPTY;
              }

              const user = store.entityMap()[id];
              if (!user || user.role === role) return EMPTY;
              // Rows stay focusable while their write is in flight (disabling
              // would throw focus to <body>), so duplicates are swallowed here.
              if (store.pendingIds().includes(id)) return EMPTY;

              // Refused here as well as disabled in the template: the control
              // being hidden is not the same as the change being impossible,
              // and this method is reachable without the control.
              const refusal = refuseRoleChange(user, role, guardContext());
              if (refusal) {
                patchState(store, setError(refusal));
                return EMPTY;
              }

              const previous = user.role;
              patchState(store, updateEntity({ id, changes: { role } }));
              begin(id);

              return api.setRole(id, role).pipe(
                tapResponse({
                  next: () => {
                    patchState(store, setFulfilled(), {
                      lastChange: {
                        id,
                        role: previous,
                        message: `${user.name} is now a ${role}.`,
                      },
                    });
                    bus.publish(
                      userRoleChanged(
                        { userId: id, email: user.email, from: previous, to: role },
                        { source: 'iam', actor: toAtlasActor(actor) }
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
              const actor = auth.user();
              if (!actor) {
                patchState(store, setError(SIGNED_OUT_REFUSAL));
                return EMPTY;
              }

              const user = store.entityMap()[id];
              if (!user || user.active === active) return EMPTY;
              if (store.pendingIds().includes(id)) return EMPTY;

              const refusal = refuseDeactivate(user, active, guardContext());
              if (refusal) {
                patchState(store, setError(refusal));
                return EMPTY;
              }

              patchState(store, updateEntity({ id, changes: { active } }));
              begin(id);

              return api.setActive(id, active).pipe(
                tapResponse({
                  next: () => {
                    patchState(store, setFulfilled(), {
                      lastChange: {
                        id,
                        active: !active,
                        message: `${user.name} ${active ? 'activated' : 'deactivated'}.`,
                      },
                    });
                    bus.publish(
                      userStatusChanged(
                        { userId: id, email: user.email, active },
                        { source: 'iam', actor: toAtlasActor(actor) }
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
  // A second pass, because undo has to call the very methods defined above.
  withMethods((store) => ({
    /**
     * Reverses the last write by making the opposite one, rather than by
     * patching state back. The inverse goes through the same API call, the same
     * guards and the same event publication — so the audit trail records what
     * actually happened, instead of an edit quietly disappearing from history.
     */
    undoLastChange(): void {
      const change = store.lastChange();
      if (!change) return;
      patchState(store, { lastChange: null });
      if (change.role !== undefined) {
        store.changeRole({ id: change.id, role: change.role });
      } else if (change.active !== undefined) {
        store.setActive({ id: change.id, active: change.active });
      }
    },
    /** Called when the operator moves on, so a stale acknowledgement is not offered. */
    dismissLastChange(): void {
      patchState(store, { lastChange: null });
    },
  })),
  withHooks({
    onInit: ({ loadUsers }) => loadUsers(),
  })
);
