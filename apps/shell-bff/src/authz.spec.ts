import { describe, expect, it } from 'vitest';
import { ROUTES, matchRoute, satisfies } from './authz';

describe('route matching', () => {
  it('matches a literal route', () => {
    expect(matchRoute('GET', '/api/flags')?.rule.pattern).toBe('/api/flags');
  });

  it('extracts and decodes parameters', () => {
    const match = matchRoute('PATCH', '/api/flags/sso-enforced');
    expect(match?.params).toEqual({ key: 'sso-enforced' });
    expect(matchRoute('PATCH', '/api/iam/users/u%2D1/role')?.params).toEqual({ id: 'u-1' });
  });

  it('does not let a collection route swallow a member route', () => {
    // segment counts must match exactly, or /api/flags would catch /api/flags/x
    expect(matchRoute('GET', '/api/flags/extra')).toBeNull();
    expect(matchRoute('PATCH', '/api/flags')).toBeNull();
  });

  it('is method-sensitive', () => {
    expect(matchRoute('DELETE', '/api/flags/x')).toBeNull();
    expect(matchRoute('POST', '/api/audit')).toBeNull(); // deliberately does not exist
  });

  it('returns null for anything unknown', () => {
    expect(matchRoute('GET', '/api/nope')).toBeNull();
    expect(matchRoute('GET', '/')).toBeNull();
  });
});

describe('the authorization table', () => {
  it('has no public routes — every entry requires at least viewer', () => {
    expect(ROUTES.every((r) => r.requires === 'admin' || r.requires === 'viewer')).toBe(true);
  });

  it('makes every IAM route admin-only', () => {
    const iam = ROUTES.filter((r) => r.pattern.startsWith('/api/iam'));
    expect(iam.length).toBeGreaterThan(0);
    expect(iam.every((r) => r.requires === 'admin')).toBe(true);
  });

  /** The flags UI does not gate this today; the server refuses regardless. */
  it('makes flag writes admin-only while flag reads stay viewer-visible', () => {
    expect(ROUTES.find((r) => r.method === 'PATCH' && r.pattern === '/api/flags/:key')?.requires)
      .toBe('admin');
    expect(ROUTES.find((r) => r.method === 'GET' && r.pattern === '/api/flags')?.requires)
      .toBe('viewer');
  });
});

describe('role satisfaction mirrors AtlasAuth.hasRole', () => {
  it('lets an admin satisfy everything', () => {
    expect(satisfies('admin', 'admin')).toBe(true);
    expect(satisfies('admin', 'viewer')).toBe(true);
  });

  it('holds a viewer to viewer-level routes', () => {
    expect(satisfies('viewer', 'viewer')).toBe(true);
    expect(satisfies('viewer', 'admin')).toBe(false);
  });
});
