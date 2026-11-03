import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/** Why a remote is down — the two failures have different recoveries (ADR-0007). */
export type RemoteFailureReason = 'entry' | 'module';

export type RemoteStatus = 'unknown' | 'loading' | 'ready' | 'down';

/**
 * What each state is called on screen, in one place, because a failed remote
 * once had three names: `unreachable`, `offline` and `down`. "unavailable" is the
 * word the failure screen's heading, its route and the `remote.unavailable` audit
 * row already use. `down` stays as the code's own identifier and is never shown.
 */
export const REMOTE_STATUS_LABEL: Record<RemoteStatus, string> = {
  unknown: 'resolved',
  loading: 'loading',
  ready: 'loaded',
  down: 'unavailable',
};

export interface RemoteHealth {
  status: RemoteStatus;
  /** Load attempts since the last success; drives the bounded auto-retry. */
  attempts: number;
  reason: RemoteFailureReason | null;
  lastError: string | null;
}

/** A health record together with the remote name it belongs to (nav rendering). */
export interface RemoteHealthEntry extends RemoteHealth {
  name: string;
}

export const UNKNOWN_REMOTE_HEALTH: RemoteHealth = {
  status: 'unknown',
  attempts: 0,
  reason: null,
  lastError: null,
};

interface RemoteHealthState {
  remotes: Record<string, RemoteHealth>;
}

function patchRemote(
  state: RemoteHealthState,
  name: string,
  changes: Partial<RemoteHealth>
): RemoteHealthState {
  const current = state.remotes[name] ?? UNKNOWN_REMOTE_HEALTH;
  return { remotes: { ...state.remotes, [name]: { ...current, ...changes } } };
}

/**
 * Per-remote availability, owned by the shell (no store crosses a federation
 * boundary — ADR-0005). Seeded at bootstrap from the federation result so the
 * navigation can show a remote as unavailable from first paint, before anyone
 * tries to navigate into it.
 */
export const RemoteHealthStore = signalStore(
  { providedIn: 'root' },
  withState<RemoteHealthState>({ remotes: {} }),
  withComputed(({ remotes }) => ({
    /** Nav-friendly view: one entry per known remote, name included. */
    list: computed((): readonly RemoteHealthEntry[] =>
      Object.entries(remotes()).map(([name, health]) => ({ name, ...health }))
    ),
  })),
  withMethods((store) => ({
    /**
     * `isRegistered` is `federation.adapters.remoteInfoRepo.contains` — a remote
     * whose remoteEntry.json could not be fetched during initFederation is simply
     * absent from the repo (the orchestrator warns and skips in non-strict mode),
     * so absence at bootstrap already means 'down' with an entry-level reason.
     */
    seed(names: readonly string[], isRegistered: (name: string) => boolean): void {
      const remotes: Record<string, RemoteHealth> = {};
      for (const name of names) {
        remotes[name] = isRegistered(name)
          ? { ...UNKNOWN_REMOTE_HEALTH }
          : {
              status: 'down',
              attempts: 0,
              reason: 'entry',
              lastError: 'remoteEntry.json could not be fetched when the shell started',
            };
      }
      patchState(store, { remotes });
    },

    markLoading(name: string): void {
      patchState(store, (state) =>
        patchRemote(state, name, {
          status: 'loading',
          attempts: (state.remotes[name]?.attempts ?? 0) + 1,
        })
      );
    },

    markReady(name: string): void {
      patchState(store, (state) =>
        patchRemote(state, name, { status: 'ready', attempts: 0, reason: null, lastError: null })
      );
    },

    markDown(name: string, reason: RemoteFailureReason, message: string): void {
      patchState(store, (state) =>
        patchRemote(state, name, { status: 'down', reason, lastError: message })
      );
    },

    /** Manual retry hands the user a fresh auto-retry budget. */
    resetAttempts(name: string): void {
      patchState(store, (state) => patchRemote(state, name, { attempts: 0 }));
    },
  }))
);
