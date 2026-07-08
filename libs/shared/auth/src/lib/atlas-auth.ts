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
 * The auth contract every provider implements — the mock today, Supabase OIDC
 * later. Shared as a federation singleton, so shell and remotes observe the
 * SAME reactive auth state; context propagates by DI, never by events.
 */
export abstract class AtlasAuth {
  abstract readonly user: Signal<AuthUser | null>;
  abstract readonly isAuthenticated: Signal<boolean>;

  /** Async seam for providers that must restore a session (OIDC redirect, JWKS…). */
  abstract init(): Promise<void>;
  abstract login(persona: MockPersona): Promise<void>;
  abstract logout(): Promise<void>;

  /** Role gate: admins satisfy every requirement; viewers only 'viewer'. */
  hasRole(required: AtlasRole): boolean {
    const user = this.user();
    if (!user) return false;
    return user.role === 'admin' || required === 'viewer';
  }
}
