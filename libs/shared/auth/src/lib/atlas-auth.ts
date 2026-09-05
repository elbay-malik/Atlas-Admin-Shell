import { Signal } from '@angular/core';
import { AtlasRole } from '@atlas/shared-contracts';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AtlasRole;
}

/** Personas available to the mock provider (documented demo credentials). */
export type MockPersona = 'admin' | 'viewer';

/**
 * An opaque, provider-defined sign-in hint: a persona for the mock, an OIDC
 * provider id such as 'github' for a real one.
 *
 * Deliberately NOT `MockPersona`. That leaked the mock's vocabulary into a
 * contract shared across every federation boundary — 'admin' | 'viewer' means
 * nothing to an identity provider, and a real implementation could not satisfy
 * the signature honestly (ADR-0006 amendment).
 */
export type AtlasLoginHint = string;

/**
 * The auth contract every provider implements — the mock today, Supabase OIDC
 * later. Shared as a federation singleton, so shell and remotes observe the
 * SAME reactive auth state; context propagates by DI, never by events.
 */
export abstract class AtlasAuth {
  abstract readonly user: Signal<AuthUser | null>;
  abstract readonly isAuthenticated: Signal<boolean>;

  /** Async seam for providers that must restore a session (OIDC redirect, JWKS…). */
  abstract init(): Promise<void>;
  abstract login(hint?: AtlasLoginHint): Promise<void>;
  abstract logout(): Promise<void>;

  /**
   * Bearer token for calls to the edge BFF, or null when unauthenticated. May
   * refresh before returning.
   *
   * It belongs on this contract rather than in the shell because remotes reach
   * auth only through this shared singleton (ADR-0005) — a remote that needed a
   * token would otherwise have no legitimate way to obtain one.
   */
  abstract getAccessToken(): Promise<string | null>;

  /** Role gate: admins satisfy every requirement; viewers only 'viewer'. */
  hasRole(required: AtlasRole): boolean {
    const user = this.user();
    if (!user) return false;
    return user.role === 'admin' || required === 'viewer';
  }
}
