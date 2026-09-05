/**
 * Cross-MFE event contracts. Every event is a versioned envelope; the payload
 * shape of a (type, version) pair is FROZEN once published — evolving a
 * payload means publishing a new version and appending it to
 * ATLAS_EVENT_VERSIONS, never editing the old shape (ADR-0005).
 *
 * This module is Angular-free on purpose: it is consumed by the bus, the
 * remotes and the contract tests alike.
 */

import { AtlasRole } from './manifest';

export type AtlasEventSource = 'shell' | 'iam' | 'feature-flags' | 'audit-logs';

export interface AtlasEventEnvelope<TType extends string, TVersion extends number, TPayload> {
  /** uuid (crypto.randomUUID()) */
  id: string;
  type: TType;
  version: TVersion;
  /** ISO-8601 */
  occurredAt: string;
  source: AtlasEventSource;
  /** acting user's email, or 'system' */
  actor: string;
  payload: TPayload;
}

export type FlagToggledV1 = AtlasEventEnvelope<'flag.toggled', 1, { key: string; enabled: boolean }>;
export type UserRoleChangedV1 = AtlasEventEnvelope<
  'user.role.changed',
  1,
  { userId: string; email: string; from: AtlasRole; to: AtlasRole }
>;
export type UserStatusChangedV1 = AtlasEventEnvelope<
  'user.status.changed',
  1,
  { userId: string; email: string; active: boolean }
>;
export type RemoteUnavailableV1 = AtlasEventEnvelope<
  'remote.unavailable',
  1,
  { remote: string; reason: 'entry' | 'module'; message: string }
>;

export type AtlasEvent = FlagToggledV1 | UserRoleChangedV1 | UserStatusChangedV1 | RemoteUnavailableV1;
export type AtlasEventType = AtlasEvent['type'];
export type AtlasEventOf<T extends AtlasEventType> = Extract<AtlasEvent, { type: T }>;

/** Append-only registry: every type lists every version ever published. */
export const ATLAS_EVENT_VERSIONS = {
  'flag.toggled': [1],
  'user.role.changed': [1],
  'user.status.changed': [1],
  'remote.unavailable': [1],
} as const satisfies Record<AtlasEventType, readonly number[]>;

const ATLAS_EVENT_SOURCES: readonly AtlasEventSource[] = ['shell', 'iam', 'feature-flags', 'audit-logs'];

type PayloadGuard = (payload: Record<string, unknown>) => boolean;

const isString = (v: unknown): v is string => typeof v === 'string';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isRole = (v: unknown): v is AtlasRole => v === 'admin' || v === 'viewer';

/**
 * Payload guards per (type, version). Adding a version here without a fixture
 * fails the contract tests; adding a fixture without a guard fails isAtlasEvent.
 */
const PAYLOAD_GUARDS: { [T in AtlasEventType]: Record<number, PayloadGuard> } = {
  'flag.toggled': {
    1: (p) => isString(p['key']) && isBoolean(p['enabled']),
  },
  'user.role.changed': {
    1: (p) => isString(p['userId']) && isString(p['email']) && isRole(p['from']) && isRole(p['to']),
  },
  'user.status.changed': {
    1: (p) => isString(p['userId']) && isString(p['email']) && isBoolean(p['active']),
  },
  'remote.unavailable': {
    1: (p) =>
      isString(p['remote']) &&
      (p['reason'] === 'entry' || p['reason'] === 'module') &&
      isString(p['message']),
  },
};

function isKnownType(type: unknown): type is AtlasEventType {
  return isString(type) && Object.prototype.hasOwnProperty.call(ATLAS_EVENT_VERSIONS, type);
}

/**
 * Full runtime guard: envelope fields, a registered (type, version) pair and
 * the payload shape published for that pair. Consumers use it at the boundary
 * (the bus validates on publish) so a malformed or unknown event never reaches
 * a store.
 */
export function isAtlasEvent(value: unknown): value is AtlasEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (!isString(e['id']) || e['id'].length === 0) return false;
  if (!isKnownType(e['type'])) return false;
  const versions: readonly number[] = ATLAS_EVENT_VERSIONS[e['type']];
  if (typeof e['version'] !== 'number' || !versions.includes(e['version'])) return false;
  if (!isString(e['occurredAt']) || Number.isNaN(Date.parse(e['occurredAt']))) return false;
  if (!ATLAS_EVENT_SOURCES.includes(e['source'] as AtlasEventSource)) return false;
  if (!isString(e['actor']) || e['actor'].length === 0) return false;
  if (typeof e['payload'] !== 'object' || e['payload'] === null) return false;
  const guard = PAYLOAD_GUARDS[e['type']][e['version']];
  return guard !== undefined && guard(e['payload'] as Record<string, unknown>);
}

export interface AtlasEventMeta {
  source: AtlasEventSource;
  actor: string;
  /** Defaults to crypto.randomUUID(); injectable for deterministic tests. */
  id?: string;
  /** Defaults to now (ISO-8601); injectable for deterministic tests. */
  occurredAt?: string;
}

export function createAtlasEvent<T extends AtlasEventType>(
  type: T,
  version: AtlasEventOf<T>['version'],
  payload: AtlasEventOf<T>['payload'],
  meta: AtlasEventMeta
): AtlasEventOf<T> {
  return {
    id: meta.id ?? crypto.randomUUID(),
    type,
    version,
    occurredAt: meta.occurredAt ?? new Date().toISOString(),
    source: meta.source,
    actor: meta.actor,
    payload,
  } as AtlasEventOf<T>;
}

export const flagToggled = (payload: FlagToggledV1['payload'], meta: AtlasEventMeta): FlagToggledV1 =>
  createAtlasEvent('flag.toggled', 1, payload, meta);

export const userRoleChanged = (
  payload: UserRoleChangedV1['payload'],
  meta: AtlasEventMeta
): UserRoleChangedV1 => createAtlasEvent('user.role.changed', 1, payload, meta);

export const userStatusChanged = (
  payload: UserStatusChangedV1['payload'],
  meta: AtlasEventMeta
): UserStatusChangedV1 => createAtlasEvent('user.status.changed', 1, payload, meta);

export const remoteUnavailable = (
  payload: RemoteUnavailableV1['payload'],
  meta: AtlasEventMeta
): RemoteUnavailableV1 => createAtlasEvent('remote.unavailable', 1, payload, meta);
