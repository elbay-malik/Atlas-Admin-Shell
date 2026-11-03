import { computed, effect, inject, untracked } from '@angular/core';
import { AtlasAuth, AuthUser } from '@atlas/shared-auth';
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

/** The last write, kept so it can be announced and, usually, reversed. */
export interface LastChange {
  id: string;
  message: string;
  /** False once this is the acknowledgement of an undo: undo is not itself undone. */
  undoable: boolean;
  /** The message of the earlier change whose Undo this one replaced, if any. */
  supersedes: string | null;
  /** Which of the row's controls this change came from. */
  field: 'role' | 'active';
  /** The value to restore, when undoable — only the one matching `field` is set. */
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
  activeAdminCount: number;
}

/**
 * The one count of administrators, used by the header and by both refusals so
 * the screen cannot state two different numbers. Active admins only, matching
 * `wouldRemoveLastAdmin` at the edge: a deactivated admin is not cover for a live
 * one (ADR-0011).
 */
export function countActiveAdmins(users: readonly IamUser[]): number {
  return users.filter((user) => user.role === 'admin' && user.active).length;
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

/** A table, not a vowel check: a third role fails to compile until it is written here. */
const ROLE_WITH_ARTICLE: Record<AtlasRole, string> = { admin: 'an admin', viewer: 'a viewer' };

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
  // user.active: demoting someone already deactivated removes no working admin.
  if (user.active && context.activeAdminCount <= 1) {
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
  if (user.role === 'admin' && user.active && context.activeAdminCount <= 1) {
    return `${user.name} is the last administrator; promote someone else first.`;
  }
  return null;
}

/** The same person with the same authority: what an offer of Undo was made to. */
function sameSession(a: AuthUser | null, b: AuthUser | null): boolean {
  return a?.id === b?.id && a?.role === b?.role;
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
  withComputed(({ entities }, auth = inject(AtlasAuth)) => {
    const activeAdminCount = computed(() => countActiveAdmins(entities()));
    return {
      activeAdminCount,
      activeCount: computed(() => entities().filter((user) => user.active).length),
      /** What the refusals need. The template and the writes both read this one. */
      refusalContext: computed(
        (): RefusalContext => ({
          actorId: auth.user()?.id ?? null,
          actorEmail: auth.user()?.email ?? '',
          activeAdminCount: activeAdminCount(),
        })
      ),
    };
  }),
  withMethods(
    (store, api = inject(IamApi), bus = inject(AtlasEventBus), auth = inject(AtlasAuth)) => {
      const begin = (id: string) =>
        patchState(store, (state) => ({ pendingIds: [...state.pendingIds, id] }));

      const settle = (id: string) =>
        patchState(store, (state) => ({
          pendingIds: state.pendingIds.filter((pending) => pending !== id),
        }));

      /** The acknowledgement of a write that just succeeded. */
      const acknowledged = (
        change: Pick<LastChange, 'id' | 'message' | 'field' | 'role' | 'active'>,
        undoOf: LastChange | undefined
      ): LastChange => {
        const earlier = store.lastChange();
        // A later change to the same control reverses the earlier one anyway, so
        // only a different control loses anything.
        const samePlace = earlier?.id === change.id && earlier.field === change.field;
        return {
          ...change,
          ...(undoOf
            ? { message: `Undone: ${undoOf.message}`, role: undefined, active: undefined }
            : {}),
          undoable: !undoOf,
          supersedes: earlier?.undoable && !samePlace ? earlier.message : null,
        };
      };

      /**
       * A failed undo leaves the change standing, so the way back must stay, but
       * only for the session that made it.
       */
      const restoreOffer = (undoOf: LastChange | undefined, actor: AuthUser) => ({
        lastChange:
          store.lastChange() ?? (sameSession(actor, auth.user()) ? undoOf : null) ?? null,
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

        /** `undoOf` marks the write as an undo; only undoLastChange passes it. */
        changeRole: rxMethod<{ id: string; role: AtlasRole; undoOf?: LastChange }>(
          // mergeMap: independent rows may be in flight at the same time
          pipe(
            mergeMap(({ id, role, undoOf }) => {
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
              const refusal = refuseRoleChange(user, role, store.refusalContext());
              if (refusal) {
                patchState(store, setError(refusal), restoreOffer(undoOf, actor));
                return EMPTY;
              }

              const previous = user.role;
              patchState(store, updateEntity({ id, changes: { role } }));
              begin(id);

              return api.setRole(id, role).pipe(
                tapResponse({
                  next: () => {
                    patchState(store, setFulfilled());
                    // Finishing after the session ended still counts as a change,
                    // and is still published. It just has nobody left to offer Undo to.
                    if (sameSession(actor, auth.user())) {
                      patchState(store, {
                        lastChange: acknowledged(
                          {
                            id,
                            field: 'role',
                            role: previous,
                            message: `${user.name} is now ${ROLE_WITH_ARTICLE[role]}.`,
                          },
                          undoOf
                        ),
                      });
                    }
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
                      setError(error.message),
                      restoreOffer(undoOf, actor)
                    ),
                  finalize: () => settle(id),
                })
              );
            })
          )
        ),

        /** `undoOf` marks the write as an undo; only undoLastChange passes it. */
        setActive: rxMethod<{ id: string; active: boolean; undoOf?: LastChange }>(
          pipe(
            mergeMap(({ id, active, undoOf }) => {
              const actor = auth.user();
              if (!actor) {
                patchState(store, setError(SIGNED_OUT_REFUSAL));
                return EMPTY;
              }

              const user = store.entityMap()[id];
              if (!user || user.active === active) return EMPTY;
              if (store.pendingIds().includes(id)) return EMPTY;

              const refusal = refuseDeactivate(user, active, store.refusalContext());
              if (refusal) {
                patchState(store, setError(refusal), restoreOffer(undoOf, actor));
                return EMPTY;
              }

              patchState(store, updateEntity({ id, changes: { active } }));
              begin(id);

              return api.setActive(id, active).pipe(
                tapResponse({
                  next: () => {
                    patchState(store, setFulfilled());
                    if (sameSession(actor, auth.user())) {
                      patchState(store, {
                        lastChange: acknowledged(
                          {
                            id,
                            field: 'active',
                            active: !active,
                            message: `${user.name} ${active ? 'activated' : 'deactivated'}.`,
                          },
                          undoOf
                        ),
                      });
                    }
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
                      setError(error.message),
                      restoreOffer(undoOf, actor)
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
      if (!change?.undoable) return;
      // The in-flight guard would swallow this write, and the offer with it.
      if (store.pendingIds().includes(change.id)) return;
      patchState(store, { lastChange: null });
      if (change.role !== undefined) {
        store.changeRole({ id: change.id, role: change.role, undoOf: change });
      } else if (change.active !== undefined) {
        store.setActive({ id: change.id, active: change.active, undoOf: change });
      }
    },
    /** Called when the status line expires, so a stale acknowledgement is not offered. */
    dismissLastChange(): void {
      patchState(store, { lastChange: null });
    },
  })),
  withHooks({
    onInit(store, auth = inject(AtlasAuth)) {
      store.loadUsers();
      // This store outlives a sign-out: it sits in the remote's cached route
      // injector, so whoever signs in next in this tab gets the same instance.
      // The offer of Undo, and the complaint about a refused write, were made to
      // the session that just ended. A failed load stays: it is about the data,
      // and it is what puts Retry on the screen.
      let session = auth.user();
      effect(() => {
        const next = auth.user();
        if (sameSession(session, next)) return;
        session = next;
        untracked(() => {
          patchState(store, { lastChange: null });
          if (store.error() && store.entities().length > 0) patchState(store, setFulfilled());
        });
      });
    },
  })
);
