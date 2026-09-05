import { InjectionToken, Signal } from '@angular/core';
import { AtlasEvent, AtlasEventOf, AtlasEventType } from '@atlas/shared-contracts';
import { Observable } from 'rxjs';

export interface AtlasEventBusConfig {
  /** Newest N events kept for replay to late-loading remotes. */
  bufferSize: number;
}

export const ATLAS_EVENT_BUS_CONFIG = new InjectionToken<AtlasEventBusConfig>(
  'ATLAS_EVENT_BUS_CONFIG'
);

export interface AtlasEventSubscribeOptions {
  /** Prepend the matching history before live events (late subscribers). */
  replay?: boolean;
}

/**
 * The cross-microfrontend event transport. Shared as a federation singleton
 * (like AtlasAuth), so the shell and every remote publish into and observe the
 * SAME instance — remotes never import each other.
 *
 * Deliberately NOT the @ngrx/signals/events Dispatcher: that is an intra-store
 * mechanism backed by a plain Subject with no replay, so a remote loaded after
 * an event was published would miss it, and the cross-MFE contract would be
 * pinned to NgRx's module identity and exact version (ADR-0005).
 */
export abstract class AtlasEventBus {
  /** Bounded history, oldest first. */
  abstract readonly history: Signal<readonly AtlasEvent[]>;

  /** Validates against the contract guard; throws on a malformed event. */
  abstract publish(event: AtlasEvent): void;

  /** Events of the given type(s), optionally replaying matching history first. */
  abstract on<T extends AtlasEventType>(
    types: T | readonly T[],
    options?: AtlasEventSubscribeOptions
  ): Observable<AtlasEventOf<T>>;

  /** Every event, optionally replaying the whole history first. */
  abstract all(options?: AtlasEventSubscribeOptions): Observable<AtlasEvent>;
}
