import { ATLAS_EVENT_VERSIONS, AtlasEventOf, AtlasEventType } from './events';

type FixtureKeyFor<T extends AtlasEventType> = `${T}.v${(typeof ATLAS_EVENT_VERSIONS)[T][number]}`;

/** `'<type>.v<n>'` for every published (type, version) pair. */
export type AtlasEventFixtureKey = {
  [T in AtlasEventType]: FixtureKeyFor<T>;
}[AtlasEventType];

/** The concrete event type behind a fixture key, so consumers keep exact payload types. */
export type AtlasEventForFixtureKey<K extends AtlasEventFixtureKey> = {
  [T in AtlasEventType]: K extends FixtureKeyFor<T> ? AtlasEventOf<T> : never;
}[AtlasEventType];

/**
 * One canonical example per published (type, version). Fixed id/occurredAt so
 * creators can be checked for fixture-equality and the catalogue snapshot is
 * stable. These are CONTRACT fixtures: change one only together with a new
 * version in ATLAS_EVENT_VERSIONS.
 */
export const ATLAS_EVENT_FIXTURES: {
  [K in AtlasEventFixtureKey]: AtlasEventForFixtureKey<K>;
} = {
  'flag.toggled.v1': {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'flag.toggled',
    version: 1,
    occurredAt: '2026-09-05T10:00:00.000Z',
    source: 'feature-flags',
    actor: 'ada@atlas.dev',
    payload: { key: 'bulk-export', enabled: true },
  },
  'user.role.changed.v1': {
    id: '00000000-0000-4000-8000-000000000002',
    type: 'user.role.changed',
    version: 1,
    occurredAt: '2026-09-05T10:01:00.000Z',
    source: 'iam',
    actor: 'ada@atlas.dev',
    payload: { userId: 'u-2', email: 'alan@atlas.dev', from: 'viewer', to: 'admin' },
  },
  'user.status.changed.v1': {
    id: '00000000-0000-4000-8000-000000000003',
    type: 'user.status.changed',
    version: 1,
    occurredAt: '2026-09-05T10:02:00.000Z',
    source: 'iam',
    actor: 'ada@atlas.dev',
    payload: { userId: 'u-2', email: 'alan@atlas.dev', active: false },
  },
  'remote.unavailable.v1': {
    id: '00000000-0000-4000-8000-000000000004',
    type: 'remote.unavailable',
    version: 1,
    occurredAt: '2026-09-05T10:03:00.000Z',
    source: 'shell',
    actor: 'system',
    payload: {
      remote: 'audit-logs',
      reason: 'entry',
      message: 'Failed to fetch http://localhost:4203/remoteEntry.json',
    },
  },
};
