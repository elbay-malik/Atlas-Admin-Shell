import { Injectable, inject } from '@angular/core';
import { Route } from '@angular/router';
import { remoteUnavailable } from '@atlas/shared-contracts';
import { AtlasEventBus } from '@atlas/shared-event-bus';
import { FEDERATION } from '../federation.token';
import { ATLAS_MANIFEST } from '../manifest.token';
import { RemoteFailureReason, RemoteHealthStore } from './remote-health.store';

/**
 * The only error `loadChildren` is allowed to reject with. `reason` decides
 * what the boundary offers the user:
 * - 'entry'  — remoteEntry.json never registered; a retry can re-run
 *              initRemoteEntry and recover in-page.
 * - 'module' — the exposed chunk itself failed; es-module-shims keeps the
 *              rejected URL in its registry for the lifetime of the page, so
 *              only a reload (or a new deployment hash) can recover.
 */
export class RemoteUnavailableError extends Error {
  constructor(
    readonly remote: string,
    readonly reason: RemoteFailureReason,
    message: string
  ) {
    super(message);
    this.name = 'RemoteUnavailableError';
  }
}

/** The orchestrator's fetch has no timeout; a hung server must not hang a navigation. */
const PROBE_TIMEOUT_MS = 5000;

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

@Injectable({ providedIn: 'root' })
export class RemoteLoader {
  private readonly manifest = inject(ATLAS_MANIFEST);
  private readonly federation = inject(FEDERATION);
  private readonly health = inject(RemoteHealthStore);
  private readonly bus = inject(AtlasEventBus);

  /**
   * Resolves with the remote's routes, or REJECTS with a RemoteUnavailableError.
   * It must never resolve with fallback routes: the router writes whatever a
   * loader resolves with into `route._loadedRoutes` and short-circuits every
   * later navigation, which is what made the slice-1 fallback sticky (ADR-0007).
   */
  async load(name: string): Promise<Route[]> {
    this.health.markLoading(name);
    try {
      const routes = await this.loadRoutes(name);
      this.health.markReady(name);
      return routes;
    } catch (error) {
      const failure =
        error instanceof RemoteUnavailableError
          ? error
          : new RemoteUnavailableError(name, 'module', describe(error));
      this.health.markDown(failure.remote, failure.reason, failure.message);
      this.bus.publish(
        remoteUnavailable(
          { remote: failure.remote, reason: failure.reason, message: failure.message },
          { source: 'shell', actor: 'system' }
        )
      );
      throw failure;
    }
  }

  private async loadRoutes(name: string): Promise<Route[]> {
    const def = this.manifest.remotes[name];
    if (!def) {
      throw new RemoteUnavailableError(name, 'entry', `"${name}" is not in the federation manifest`);
    }

    const repo = this.federation.adapters.remoteInfoRepo;
    if (!repo.contains(name)) {
      try {
        await this.probe(def.url);
        await this.federation.initRemoteEntry(def.url, name);
      } catch (error) {
        throw new RemoteUnavailableError(name, 'entry', describe(error));
      }
      // initRemoteEntry resolves even when it failed (non-strict mode logs
      // "Failed to initialize remote entry, continuing anyway"), so the repo is
      // the only trustworthy success signal.
      if (!repo.contains(name)) {
        throw new RemoteUnavailableError(
          name,
          'entry',
          `remoteEntry.json for "${name}" did not register the remote`
        );
      }
    }

    let module: unknown;
    try {
      module = await this.federation.loadRemoteModule(name, def.exposedModule);
    } catch (error) {
      // The orchestrator wraps registry problems in NFError; a chunk fetch
      // failure comes straight from importShim as a TypeError.
      const reason: RemoteFailureReason =
        error instanceof Error && error.name === 'NFError' ? 'entry' : 'module';
      throw new RemoteUnavailableError(name, reason, describe(error));
    }

    const routes = (module as { remoteRoutes?: Route[] } | null)?.remoteRoutes;
    if (!Array.isArray(routes)) {
      throw new RemoteUnavailableError(
        name,
        'module',
        `"${name}" did not expose remoteRoutes from ${def.exposedModule}`
      );
    }
    return routes;
  }

  /**
   * Cheap liveness check before handing the URL to the orchestrator: its own
   * fetch has no timeout, so a server that accepts the connection and then
   * hangs would block the navigation for the browser's default timeout.
   */
  private async probe(url: string): Promise<void> {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} for ${url}`);
    }
  }
}
