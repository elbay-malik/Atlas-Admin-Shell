import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, delay, map, of } from 'rxjs';
import { AuditEntry } from './audit-entry';

/**
 * The trail that already existed before this remote joined the event bus.
 * Everything published on the bus is appended to it at runtime.
 */
export const AUDIT_SEED: readonly AuditEntry[] = [
  {
    id: 'e-1',
    at: '2026-07-08T09:12:00.000Z',
    actor: 'ada@atlas.dev',
    action: 'user.role.changed',
    target: 'alan@atlas.dev',
    source: 'seed',
  },
  {
    id: 'e-2',
    at: '2026-07-08T08:47:00.000Z',
    actor: 'grace@atlas.dev',
    action: 'flag.enabled',
    target: 'new-dashboard',
    source: 'seed',
  },
  {
    id: 'e-3',
    at: '2026-07-07T17:03:00.000Z',
    actor: 'ada@atlas.dev',
    action: 'user.invited',
    target: 'kj@atlas.dev',
    source: 'seed',
  },
  {
    id: 'e-4',
    at: '2026-07-07T12:30:00.000Z',
    actor: 'system',
    action: 'tenant.provisioned',
    target: 'acme-corp',
    source: 'seed',
  },
];

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
    return of([...AUDIT_SEED]).pipe(delay(300));
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
