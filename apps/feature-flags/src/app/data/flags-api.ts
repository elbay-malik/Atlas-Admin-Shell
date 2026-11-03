import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, concatMap, delay, map, of, throwError } from 'rxjs';

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  /**
   * What flipping this flag reaches, for a flag where that goes well beyond the
   * operator. Its presence is what asks for the extra confirm step, so marking a
   * flag is a data change and never a template change.
   */
  blastRadius?: string;
}

/** The canonical flag set this demo remote owns. */
const SEED: readonly FeatureFlag[] = [
  { key: 'new-dashboard', description: 'Next-gen dashboard layout', enabled: true },
  { key: 'bulk-export', description: 'CSV export for audit logs', enabled: false },
  {
    key: 'sso-enforced',
    description: 'Require SSO for all tenants',
    enabled: false,
    blastRadius: 'Changes sign-in for every tenant as soon as you confirm.',
  },
];

const GET_FLAGS_DELAY_MS = 300;
const SET_ENABLED_DELAY_MS = 200;

/**
 * What the store depends on. Two implementations satisfy it: the mock below,
 * and FlagsHttpApi against the edge BFF. The store, its optimistic writes and
 * its rollback logic are identical either way — which is the point of keeping
 * the seam here rather than inside the store.
 */
@Injectable()
export abstract class FlagsApi {
  abstract getFlags(): Observable<FeatureFlag[]>;
  abstract setEnabled(key: string, enabled: boolean): Observable<void>;
}

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
export class FlagsMockApi extends FlagsApi {
  private failing = false;


  /** The next call — whichever it is — fails once, then the hook disarms. */
  failNext(): void {
    this.failing = true;
  }

  override getFlags(): Observable<FeatureFlag[]> {
    return this.deliver(
      SEED.map((flag) => ({ ...flag })),
      GET_FLAGS_DELAY_MS,
      'Could not load feature flags'
    );
  }

  override setEnabled(key: string, enabled: boolean): Observable<void> {
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

/**
 * The real backend. Authorization lives at the edge (ADR-0011): a viewer's
 * toggle is refused there with a 403 regardless of what this client believes,
 * and the bearer token is attached by the interceptor in @atlas/shared-auth.
 */
@Injectable()
export class FlagsHttpApi extends FlagsApi {
  private readonly http = inject(HttpClient);

  override getFlags(): Observable<FeatureFlag[]> {
    return this.http
      .get<{ flags: FeatureFlag[] }>('/api/flags')
      .pipe(map((response) => response.flags));
  }

  override setEnabled(key: string, enabled: boolean): Observable<void> {
    return this.http
      .patch<unknown>(`/api/flags/${encodeURIComponent(key)}`, { enabled })
      .pipe(map(() => undefined));
  }
}
