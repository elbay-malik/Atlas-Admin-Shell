import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { AtlasEvent, AtlasManifest } from '@atlas/shared-contracts';
import { AtlasEventBus, provideAtlasEventBus } from '@atlas/shared-event-bus';
import { Subscription } from 'rxjs';
import { FEDERATION } from '../federation.token';
import { ATLAS_MANIFEST } from '../manifest.token';
import { RemoteHealthStore } from './remote-health.store';
import { RemoteLoader, RemoteUnavailableError } from './remote-loader';

const manifest: AtlasManifest = {
  version: 1,
  remotes: {
    iam: {
      url: 'http://localhost:4201/remoteEntry.json',
      displayName: 'Identity & Access',
      route: 'iam',
      icon: '👥',
      exposedModule: './Routes',
      requiredRole: 'admin',
    },
  },
};

const remoteRoutes: Route[] = [{ path: '', children: [] }];

interface FakeFederationOptions {
  /** Names already registered when initFederation finished. */
  registered?: string[];
  /** Names initRemoteEntry manages to register (it resolves even on failure). */
  registersOnInit?: string[];
  loadRemoteModule?: () => Promise<unknown>;
}

function fakeFederation(options: FakeFederationOptions) {
  const registered = new Set(options.registered ?? []);
  const calls = { initRemoteEntry: 0, loadRemoteModule: 0 };
  const federation = {
    adapters: { remoteInfoRepo: { contains: (name: string) => registered.has(name) } },
    initRemoteEntry: async (_url: string, name: string) => {
      calls.initRemoteEntry += 1;
      // Non-strict mode swallows failures and resolves regardless, so the repo
      // is the only trustworthy signal — model exactly that.
      if (options.registersOnInit?.includes(name)) registered.add(name);
      return federation;
    },
    loadRemoteModule:
      options.loadRemoteModule ??
      (async () => {
        calls.loadRemoteModule += 1;
        return { remoteRoutes };
      }),
  };
  return { federation, calls, registered };
}

function setup(options: FakeFederationOptions) {
  const { federation, calls } = fakeFederation(options);
  TestBed.configureTestingModule({
    providers: [
      provideAtlasEventBus(),
      { provide: ATLAS_MANIFEST, useValue: manifest },
      { provide: FEDERATION, useValue: federation },
    ],
  });
  const published: AtlasEvent[] = [];
  const subscription = TestBed.inject(AtlasEventBus)
    .all()
    .subscribe((event) => published.push(event));
  return {
    loader: TestBed.inject(RemoteLoader),
    health: TestBed.inject(RemoteHealthStore),
    published,
    subscription,
    calls,
  };
}

describe('RemoteLoader', () => {
  let subscription: Subscription | undefined;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    subscription?.unsubscribe();
    globalThis.fetch = originalFetch;
  });

  /** The liveness probe that runs before initRemoteEntry. */
  function stubProbe(ok: boolean): void {
    globalThis.fetch = (async () =>
      ({ ok, status: ok ? 200 : 503, statusText: ok ? 'OK' : 'Service Unavailable' }) as Response) as typeof fetch;
  }

  it('returns the remote routes and marks the remote ready', async () => {
    const ctx = setup({ registered: ['iam'] });
    subscription = ctx.subscription;

    await expect(ctx.loader.load('iam')).resolves.toEqual(remoteRoutes);
    expect(ctx.health.remotes()['iam']).toMatchObject({ status: 'ready', attempts: 0 });
    expect(ctx.published).toEqual([]);
    expect(ctx.calls.initRemoteEntry).toBe(0); // already registered — no re-init
  });

  it('re-initialises a remote that is not yet registered, then loads it', async () => {
    const ctx = setup({ registered: [], registersOnInit: ['iam'] });
    subscription = ctx.subscription;
    stubProbe(true);

    await expect(ctx.loader.load('iam')).resolves.toEqual(remoteRoutes);
    expect(ctx.calls.initRemoteEntry).toBe(1);
    expect(ctx.health.remotes()['iam'].status).toBe('ready');
  });

  it("fails with reason 'entry' when initRemoteEntry silently does not register the remote", async () => {
    const ctx = setup({ registered: [], registersOnInit: [] });
    subscription = ctx.subscription;
    stubProbe(true);

    await expect(ctx.loader.load('iam')).rejects.toMatchObject({
      name: 'RemoteUnavailableError',
      remote: 'iam',
      reason: 'entry',
    });
    expect(ctx.health.remotes()['iam']).toMatchObject({ status: 'down', reason: 'entry' });
  });

  it("fails with reason 'entry' when the liveness probe rejects the URL", async () => {
    const ctx = setup({ registered: [] });
    subscription = ctx.subscription;
    stubProbe(false);

    await expect(ctx.loader.load('iam')).rejects.toBeInstanceOf(RemoteUnavailableError);
    expect(ctx.health.remotes()['iam'].lastError).toContain('503');
  });

  it("classifies a chunk failure as 'module', which needs a reload rather than a retry", async () => {
    const ctx = setup({
      registered: ['iam'],
      // importShim rejects with a plain TypeError, not an NFError
      loadRemoteModule: async () => {
        throw new TypeError('Unable to fetch Routes-ABC123.js');
      },
    });
    subscription = ctx.subscription;

    await expect(ctx.loader.load('iam')).rejects.toMatchObject({ reason: 'module' });
    expect(ctx.health.remotes()['iam']).toMatchObject({ status: 'down', reason: 'module' });
  });

  it("classifies an NFError from the orchestrator as 'entry'", async () => {
    const nfError = Object.assign(new Error('Failed to load module iam/./Routes'), {
      name: 'NFError',
    });
    const ctx = setup({ registered: ['iam'], loadRemoteModule: async () => Promise.reject(nfError) });
    subscription = ctx.subscription;

    await expect(ctx.loader.load('iam')).rejects.toMatchObject({ reason: 'entry' });
  });

  it('rejects a module that does not expose remoteRoutes', async () => {
    const ctx = setup({ registered: ['iam'], loadRemoteModule: async () => ({ nope: true }) });
    subscription = ctx.subscription;

    await expect(ctx.loader.load('iam')).rejects.toMatchObject({ reason: 'module' });
    expect(ctx.health.remotes()['iam'].lastError).toContain('did not expose remoteRoutes');
  });

  it('rejects a remote that is not in the manifest at all', async () => {
    const ctx = setup({ registered: [] });
    subscription = ctx.subscription;

    await expect(ctx.loader.load('ghost')).rejects.toMatchObject({ reason: 'entry' });
  });

  it('publishes remote.unavailable v1 on the bus so audit-logs records the outage', async () => {
    const ctx = setup({ registered: ['iam'], loadRemoteModule: async () => ({}) });
    subscription = ctx.subscription;

    await expect(ctx.loader.load('iam')).rejects.toBeInstanceOf(RemoteUnavailableError);

    expect(ctx.published).toHaveLength(1);
    expect(ctx.published[0]).toMatchObject({
      type: 'remote.unavailable',
      version: 1,
      source: 'shell',
      actor: 'system',
      payload: { remote: 'iam', reason: 'module' },
    });
  });
});
