import { TestBed } from '@angular/core/testing';
import { RemoteHealthStore } from './remote-health.store';

function createStore() {
  TestBed.configureTestingModule({});
  return TestBed.inject(RemoteHealthStore);
}

describe('RemoteHealthStore', () => {
  it('seeds a remote missing from the federation registry as already down', () => {
    const store = createStore();
    // remoteInfoRepo.contains() is false for any remote whose remoteEntry.json
    // could not be fetched during initFederation — the orchestrator warns and
    // skips it in non-strict mode.
    store.seed(['iam', 'audit-logs'], (name) => name !== 'audit-logs');

    expect(store.remotes()['iam'].status).toBe('unknown');
    expect(store.remotes()['audit-logs']).toMatchObject({ status: 'down', reason: 'entry' });
  });

  it('exposes a nav-friendly list carrying the remote name', () => {
    const store = createStore();
    store.seed(['iam'], () => true);
    expect(store.list()).toEqual([
      { name: 'iam', status: 'unknown', attempts: 0, reason: null, lastError: null },
    ]);
  });

  it('counts attempts while loading and clears them on success', () => {
    const store = createStore();
    store.seed(['iam'], () => true);

    store.markLoading('iam');
    store.markLoading('iam');
    expect(store.remotes()['iam']).toMatchObject({ status: 'loading', attempts: 2 });

    store.markReady('iam');
    expect(store.remotes()['iam']).toMatchObject({ status: 'ready', attempts: 0, lastError: null });
  });

  it('records why a remote went down', () => {
    const store = createStore();
    store.seed(['iam'], () => true);
    store.markLoading('iam');
    store.markDown('iam', 'module', 'chunk 404');

    expect(store.remotes()['iam']).toMatchObject({
      status: 'down',
      reason: 'module',
      lastError: 'chunk 404',
      attempts: 1,
    });
  });

  it('gives a manual retry a fresh attempt budget', () => {
    const store = createStore();
    store.seed(['iam'], () => true);
    store.markLoading('iam');
    store.markDown('iam', 'entry', 'unreachable');

    store.resetAttempts('iam');
    expect(store.remotes()['iam'].attempts).toBe(0);
    expect(store.remotes()['iam'].status).toBe('down');
  });

  it('tolerates updates for a remote it has never seen', () => {
    const store = createStore();
    store.markDown('ghost', 'entry', 'not in the manifest');
    expect(store.remotes()['ghost']).toMatchObject({ status: 'down', reason: 'entry' });
  });
});
