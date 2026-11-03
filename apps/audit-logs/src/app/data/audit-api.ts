import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, delay, map, of } from 'rxjs';
import { AuditEntry } from './audit-entry';

const MINUTE_MS = 60_000;

/** Minutes before the load, keeping the spacing a real day of events would have. */
const SEED_ROWS: readonly (Omit<AuditEntry, 'at' | 'source'> & { minutesAgo: number })[] = [
  { id: 'e-1', minutesAgo: 35, actor: 'ada@atlas.dev', action: 'user.role.changed', target: 'alan@atlas.dev' },
  { id: 'e-2', minutesAgo: 60, actor: 'grace@atlas.dev', action: 'flag.enabled', target: 'new-dashboard' },
  { id: 'e-3', minutesAgo: 16 * 60 + 4, actor: 'ada@atlas.dev', action: 'user.invited', target: 'kj@atlas.dev' },
  { id: 'e-4', minutesAgo: 20 * 60 + 37, actor: 'system', action: 'tenant.provisioned', target: 'acme-corp' },
];

/**
 * The trail that already existed before this remote joined the event bus.
 * Everything published on the bus is appended to it at runtime.
 *
 * Dated back from `now` rather than fixed. Fixed dates made a sample look like a
 * platform nobody had touched for months, which said something untrue about a
 * console that was running. These are no more real than those were: they are mock
 * rows, the header says `mock data`, and the screen's note says how they are dated.
 */
export function auditSeed(now: number = Date.now()): AuditEntry[] {
  const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  return SEED_ROWS.map(({ minutesAgo, ...row }) => ({
    ...row,
    at: new Date(minute - minutesAgo * MINUTE_MS).toISOString(),
    source: 'seed',
  }));
}

/**
 * Mock backend for the audit trail. The delay is deliberate: it makes the
 * store's pending slice observable in tests and in the browser, and it is what
 * the late-subscriber replay races against on a cold load.
 *
 * Provided by `remoteRoutes`, not `providedIn: 'root'`, so the remote owns the
 * instance inside its own route injector (ADR-0005: nothing crosses a
 * federation boundary).
 */
/**
 * What the store depends on. The HTTP implementation filters SERVER-side, so
 * the query string is treated as untrusted input at the edge rather than here
 * (ADR-0011).
 */
@Injectable()
export abstract class AuditApi {
  abstract getEvents(): Observable<AuditEntry[]>;
}

@Injectable()
export class AuditMockApi extends AuditApi {
  override getEvents(): Observable<AuditEntry[]> {
    return of(auditSeed()).pipe(delay(300));
  }
}

/** The real backend; the trail it returns is written server-side from verified tokens. */
@Injectable()
export class AuditHttpApi extends AuditApi {
  private readonly http = inject(HttpClient);

  override getEvents(): Observable<AuditEntry[]> {
    return this.http.get<{ entries: AuditEntry[] }>('/api/audit').pipe(map((r) => r.entries));
  }
}
