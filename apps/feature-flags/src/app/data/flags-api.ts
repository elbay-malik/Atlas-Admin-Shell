import { Injectable } from '@angular/core';
import { Observable, concatMap, delay, of, throwError } from 'rxjs';

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
}

/** The canonical flag set this demo remote owns. */
const SEED: readonly FeatureFlag[] = [
  { key: 'new-dashboard', description: 'Next-gen dashboard layout', enabled: true },
  { key: 'bulk-export', description: 'CSV export for audit logs', enabled: false },
  { key: 'sso-enforced', description: 'Require SSO for all tenants', enabled: false },
];

const GET_FLAGS_DELAY_MS = 300;
const SET_ENABLED_DELAY_MS = 200;

/**
 * Mock backend for the flags domain. Latency is simulated so the store's
 * pending/optimistic paths are real, and `failNext()` arms a single
 * deterministic failure so tests (and the e2e error-state check) can exercise
 * rollback without racing a network.
 *
 * Deliberately NOT `providedIn: 'root'`: the remote provides it on its own root
 * route (remote.routes.ts) so nothing leaks across the federation boundary.
 */
@Injectable()
export class FlagsApi {
  private failing = false;

  /** The next call — whichever it is — fails once, then the hook disarms. */
  failNext(): void {
    this.failing = true;
  }

  getFlags(): Observable<FeatureFlag[]> {
    return this.deliver(
      SEED.map((flag) => ({ ...flag })),
      GET_FLAGS_DELAY_MS,
      'Could not load feature flags'
    );
  }

  setEnabled(key: string, enabled: boolean): Observable<void> {
    return this.deliver<void>(
      undefined,
      SET_ENABLED_DELAY_MS,
      `Could not turn "${key}" ${enabled ? 'on' : 'off'}`
    );
  }

  /** Resolves after `delayMs`, or fails there if `failNext()` was armed. */
  private deliver<T>(value: T, delayMs: number, failureMessage: string): Observable<T> {
    return of(value).pipe(
      delay(delayMs),
      concatMap((settled) => {
        if (!this.failing) return of(settled);
        this.failing = false;
        return throwError(() => new Error(failureMessage));
      })
    );
  }
}
