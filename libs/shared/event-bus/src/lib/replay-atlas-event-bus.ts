import { Injectable, inject, signal } from '@angular/core';
import { AtlasEvent, AtlasEventOf, AtlasEventType, isAtlasEvent } from '@atlas/shared-contracts';
import { Observable, Subject, concat, filter, from } from 'rxjs';
import {
  ATLAS_EVENT_BUS_CONFIG,
  AtlasEventBus,
  AtlasEventSubscribeOptions,
} from './atlas-event-bus';

/**
 * Signal-backed bounded history plus a live Subject. `replay: true` hands a
 * late subscriber the matching history before the live stream, which is what
 * makes the audit remote correct even when it is loaded long after a flag was
 * toggled in another remote.
 */
@Injectable()
export class ReplayAtlasEventBus extends AtlasEventBus {
  private readonly config = inject(ATLAS_EVENT_BUS_CONFIG);
  private readonly buffer = signal<readonly AtlasEvent[]>([]);
  private readonly live = new Subject<AtlasEvent>();

  readonly history = this.buffer.asReadonly();

  publish(event: AtlasEvent): void {
    if (!isAtlasEvent(event)) {
      throw new Error(
        `Invalid Atlas event: ${String((event as Partial<AtlasEvent> | null)?.type ?? event)}`
      );
    }
    this.buffer.update((events) => [...events, event].slice(-this.config.bufferSize));
    this.live.next(event);
  }

  on<T extends AtlasEventType>(
    types: T | readonly T[],
    options?: AtlasEventSubscribeOptions
  ): Observable<AtlasEventOf<T>> {
    const wanted = new Set<AtlasEventType>(Array.isArray(types) ? types : [types as T]);
    const matches = (event: AtlasEvent): event is AtlasEventOf<T> => wanted.has(event.type);
    return this.stream(options, matches);
  }

  all(options?: AtlasEventSubscribeOptions): Observable<AtlasEvent> {
    return this.stream(options, (): boolean => true);
  }

  private stream<TEvent extends AtlasEvent>(
    options: AtlasEventSubscribeOptions | undefined,
    matches: (event: AtlasEvent) => boolean
  ): Observable<TEvent> {
    const live$ = this.live.pipe(filter(matches)) as Observable<TEvent>;
    if (!options?.replay) return live$;
    // snapshot at subscribe time, not at call time
    return new Observable<TEvent>((subscriber) => {
      const replayed = this.buffer().filter(matches) as TEvent[];
      return concat(from(replayed), live$).subscribe(subscriber);
    });
  }
}
