import { Injectable } from '@angular/core';
import { AtlasRole } from '@atlas/shared-contracts';
import { Observable, concatMap, delay, of, throwError } from 'rxjs';

export interface IamUser {
  id: string;
  name: string;
  email: string;
  role: AtlasRole;
  active: boolean;
}

/** The directory this demo remote owns. */
const SEED: readonly IamUser[] = [
  { id: 'u-1', name: 'Ada Lovelace', email: 'ada@atlas.dev', role: 'admin', active: true },
  { id: 'u-2', name: 'Grace Hopper', email: 'grace@atlas.dev', role: 'admin', active: true },
  { id: 'u-3', name: 'Alan Turing', email: 'alan@atlas.dev', role: 'viewer', active: true },
  { id: 'u-4', name: 'Katherine Johnson', email: 'kj@atlas.dev', role: 'viewer', active: false },
];

const GET_USERS_DELAY_MS = 300;
const WRITE_DELAY_MS = 200;

/**
 * Mock backend for the IAM domain. Latency is simulated so the store's
 * optimistic paths are real, and `failNext()` arms a single deterministic
 * failure so tests can exercise rollback without racing a network.
 *
 * Deliberately NOT `providedIn: 'root'`: the remote provides it on its own root
 * route so nothing leaks across the federation boundary.
 */
@Injectable()
export class IamApi {
  private failing = false;

  /** The next call — whichever it is — fails once, then the hook disarms. */
  failNext(): void {
    this.failing = true;
  }

  getUsers(): Observable<IamUser[]> {
    return this.deliver(
      SEED.map((user) => ({ ...user })),
      GET_USERS_DELAY_MS,
      'Could not load users'
    );
  }

  setRole(id: string, role: AtlasRole): Observable<void> {
    return this.deliver<void>(undefined, WRITE_DELAY_MS, `Could not make ${id} a ${role}`);
  }

  setActive(id: string, active: boolean): Observable<void> {
    return this.deliver<void>(
      undefined,
      WRITE_DELAY_MS,
      `Could not ${active ? 'activate' : 'deactivate'} ${id}`
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
