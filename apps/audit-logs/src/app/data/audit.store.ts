import { computed, inject } from '@angular/core';
import { AtlasEvent } from '@atlas/shared-contracts';
import { AtlasEventBus } from '@atlas/shared-event-bus';
import { setError, setFulfilled, setPending, withRequestStatus } from '@atlas/shared-util';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { entityConfig, prependEntity, upsertEntities, withEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { exhaustMap, map, pipe, tap } from 'rxjs';
import { AuditApi } from './audit-api';
import { AuditEntry } from './audit-entry';
import { toAuditEntry } from './to-audit-entry';

const auditConfig = entityConfig({
  entity: type<AuditEntry>(),
  selectId: (entry) => entry.id,
});

const newestFirst = (a: AuditEntry, b: AuditEntry): number => Date.parse(b.at) - Date.parse(a.at);

const matches = (entry: AuditEntry, query: string): boolean =>
  entry.actor.toLowerCase().includes(query) ||
  entry.action.toLowerCase().includes(query) ||
  entry.target.toLowerCase().includes(query);

/** The entries a filter keeps; a blank filter keeps them all. */
export function filterEntries(entries: AuditEntry[], query: string): AuditEntry[] {
  const q = query.trim().toLowerCase();
  return q ? entries.filter((entry) => matches(entry, q)) : entries;
}

/**
 * The audit trail: the seeded history from the mock backend plus every event
 * published on the cross-MFE bus, in one entity collection keyed by event id.
 *
 * Provided by `remoteRoutes` (not `providedIn: 'root'`) so the instance lives
 * in this remote's lazy route injector and survives navigation within the
 * remote without ever leaking across the federation boundary (ADR-0005).
 */
export const AuditStore = signalStore(
  withEntities(auditConfig),
  withRequestStatus(),
  withState({ query: '' }),
  withComputed(({ entities, query }) => ({
    filtered: computed(() => [...filterEntries(entities(), query())].sort(newestFirst)),
  })),
  withMethods((store, api = inject(AuditApi)) => ({
    setQuery(query: string): void {
      patchState(store, { query });
    },

    load: rxMethod<void>(
      pipe(
        tap(() => patchState(store, setPending())),
        // exhaustMap: a second Retry click while a load is in flight is ignored
        exhaustMap(() =>
          api.getEvents().pipe(
            // tapResponse keeps the error inside the inner observable; an error
            // escaping to the rxMethod pipeline would kill load() permanently
            tapResponse({
              // upsert, NOT setAll: the bus replay lands before this 300ms
              // response, and setAllEntities would wipe those live rows
              next: (entries) => patchState(store, upsertEntities(entries, auditConfig), setFulfilled()),
              error: (error: Error) => patchState(store, setError(error.message)),
            })
          )
        )
      )
    ),

    /**
     * Bus -> trail. `prependEntity` is a no-op when the id is already present,
     * so replay-then-live delivery of the same event cannot duplicate a row.
     */
    ingest: rxMethod<AtlasEvent>(
      pipe(
        map(toAuditEntry),
        tap((entry) => patchState(store, prependEntity(entry, auditConfig)))
      )
    ),
  })),
  withHooks({
    onInit(store, bus = inject(AtlasEventBus)) {
      store.load();
      // replay: true is the late-subscriber contract — events published before
      // this remote was even downloaded still reach the trail
      store.ingest(bus.all({ replay: true }));
    },
  })
);
