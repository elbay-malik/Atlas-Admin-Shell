import {
  ATLAS_EVENT_VERSIONS,
  AtlasEvent,
  AtlasEventMeta,
  AtlasEventType,
  createAtlasEvent,
  flagToggled,
  isAtlasEvent,
  remoteUnavailable,
  userRoleChanged,
  userStatusChanged,
} from './events';
import { ATLAS_EVENT_FIXTURES, AtlasEventFixtureKey } from './events.fixtures';

const fixtureEntries = Object.entries(ATLAS_EVENT_FIXTURES) as [AtlasEventFixtureKey, AtlasEvent][];

const metaOf = (event: AtlasEvent): AtlasEventMeta => ({
  source: event.source,
  actor: event.actor,
  id: event.id,
  occurredAt: event.occurredAt,
});

describe('Atlas event contracts', () => {
  it('has a fixture for every published (type, version)', () => {
    const expected = (Object.keys(ATLAS_EVENT_VERSIONS) as AtlasEventType[]).flatMap((type) =>
      ATLAS_EVENT_VERSIONS[type].map((version) => `${type}.v${version}`)
    );
    expect(Object.keys(ATLAS_EVENT_FIXTURES).sort()).toEqual([...expected].sort());
  });

  it.each(fixtureEntries)('fixture %s passes the runtime guard', (key, fixture) => {
    expect(isAtlasEvent(fixture)).toBe(true);
    expect(`${fixture.type}.v${fixture.version}`).toBe(key);
  });

  it('rejects non-objects', () => {
    expect(isAtlasEvent(null)).toBe(false);
    expect(isAtlasEvent(undefined)).toBe(false);
    expect(isAtlasEvent('flag.toggled')).toBe(false);
  });

  it.each(fixtureEntries)('%s: rejects a dropped envelope field', (_key, fixture) => {
    for (const field of Object.keys(fixture) as (keyof AtlasEvent)[]) {
      const mutated: Partial<AtlasEvent> = { ...fixture };
      delete mutated[field];
      expect(isAtlasEvent(mutated), `dropped ${field}`).toBe(false);
    }
  });

  it.each(fixtureEntries)('%s: rejects a dropped payload field', (_key, fixture) => {
    for (const field of Object.keys(fixture.payload)) {
      const payload: Record<string, unknown> = { ...fixture.payload };
      delete payload[field];
      expect(isAtlasEvent({ ...fixture, payload }), `dropped payload.${field}`).toBe(false);
    }
  });

  it.each(fixtureEntries)('%s: rejects a wrong payload field type', (_key, fixture) => {
    for (const [field, value] of Object.entries(fixture.payload)) {
      const wrong = typeof value === 'string' ? 42 : 'not-the-right-type';
      const payload = { ...fixture.payload, [field]: wrong };
      expect(isAtlasEvent({ ...fixture, payload }), `payload.${field}`).toBe(false);
    }
  });

  it.each(fixtureEntries)('%s: rejects an unpublished version', (_key, fixture) => {
    expect(isAtlasEvent({ ...fixture, version: 999 })).toBe(false);
    expect(isAtlasEvent({ ...fixture, version: '1' })).toBe(false);
  });

  it('rejects an unknown type', () => {
    const fixture = ATLAS_EVENT_FIXTURES['flag.toggled.v1'];
    expect(isAtlasEvent({ ...fixture, type: 'flag.deleted' })).toBe(false);
    expect(isAtlasEvent({ ...fixture, type: 'toString' })).toBe(false);
  });

  it('rejects an unknown source, empty actor and malformed occurredAt', () => {
    const fixture = ATLAS_EVENT_FIXTURES['flag.toggled.v1'];
    expect(isAtlasEvent({ ...fixture, source: 'billing' })).toBe(false);
    expect(isAtlasEvent({ ...fixture, actor: '' })).toBe(false);
    expect(isAtlasEvent({ ...fixture, occurredAt: 'yesterday' })).toBe(false);
  });

  it('createAtlasEvent reproduces every fixture given the same id/occurredAt', () => {
    for (const [, fixture] of fixtureEntries) {
      expect(
        createAtlasEvent(fixture.type, fixture.version, fixture.payload, metaOf(fixture))
      ).toEqual(fixture);
    }
  });

  it('typed creators reproduce their fixtures', () => {
    const flag = ATLAS_EVENT_FIXTURES['flag.toggled.v1'];
    const role = ATLAS_EVENT_FIXTURES['user.role.changed.v1'];
    const status = ATLAS_EVENT_FIXTURES['user.status.changed.v1'];
    const remote = ATLAS_EVENT_FIXTURES['remote.unavailable.v1'];
    expect(flagToggled(flag.payload, metaOf(flag))).toEqual(flag);
    expect(userRoleChanged(role.payload, metaOf(role))).toEqual(role);
    expect(userStatusChanged(status.payload, metaOf(status))).toEqual(status);
    expect(remoteUnavailable(remote.payload, metaOf(remote))).toEqual(remote);
  });

  it('creators default id and occurredAt to a uuid and an ISO timestamp', () => {
    const event = flagToggled({ key: 'k', enabled: false }, { source: 'feature-flags', actor: 'system' });
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
    expect(isAtlasEvent(event)).toBe(true);
  });

  /**
   * Catalogue snapshot: the committed __snapshots__/events.spec.ts.snap is the
   * frozen public shape. Vitest refuses to write new snapshots in CI, so any
   * envelope/payload key change fails until someone updates it deliberately
   * (`nx test shared-contracts -- -u`) alongside a new version.
   */
  it('matches the published event catalogue', () => {
    const catalogue = fixtureEntries
      .map(([, fixture]) => ({
        type: fixture.type,
        version: fixture.version,
        envelopeKeys: Object.keys(fixture).sort(),
        payloadKeys: Object.keys(fixture.payload).sort(),
      }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.version - b.version);
    expect(catalogue).toMatchSnapshot();
  });
});
