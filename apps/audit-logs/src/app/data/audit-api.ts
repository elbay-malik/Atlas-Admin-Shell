import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
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
@Injectable()
export class AuditApi {
  getEvents(): Observable<AuditEntry[]> {
    return of([...AUDIT_SEED]).pipe(delay(300));
  }
}
