import { Injectable, computed, signal } from '@angular/core';
import { AtlasAuth, AuthUser, MockPersona } from './atlas-auth';

const STORAGE_KEY = 'atlas.auth.persona';

const PERSONAS: Record<MockPersona, AuthUser> = {
  admin: { id: 'u-admin', name: 'Ada Lovelace', email: 'ada@atlas.dev', role: 'admin' },
  viewer: { id: 'u-viewer', name: 'Alan Turing', email: 'alan@atlas.dev', role: 'viewer' },
};

/**
 * Demo-grade provider: two personas, persisted locally. Not security — the
 * real OIDC provider replaces this behind the same AtlasAuth interface.
 */
@Injectable()
export class MockAtlasAuth extends AtlasAuth {
  private readonly currentUser = signal<AuthUser | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  async init(): Promise<void> {
    const stored = this.readStored();
    this.currentUser.set(stored ? PERSONAS[stored] : null);
  }

  async login(persona: MockPersona): Promise<void> {
    this.currentUser.set(PERSONAS[persona]);
    try {
      localStorage.setItem(STORAGE_KEY, persona);
    } catch {
      // persistence is best-effort in the mock
    }
  }

  async logout(): Promise<void> {
    this.currentUser.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private readStored(): MockPersona | null {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'admin' || value === 'viewer' ? value : null;
    } catch {
      return null;
    }
  }
}
