import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AtlasAuth, AtlasLoginHint, AuthUser } from '@atlas/shared-auth';
import { toAuthUser } from './claims';
import { ATLAS_IDENTITY } from './identity.port';

/**
 * The real identity provider, satisfying the same AtlasAuth contract as the
 * mock (ADR-0006). It lives in the SHELL, not in @atlas/shared-auth: putting a
 * provider-importing file in that lib's barrel would pull the client into every
 * remote's shared set, because each remote's entry graph already reaches the
 * lib. Only the abstract token crosses the federation boundary.
 *
 * It is named for what it does — hold a token-derived user — rather than for a
 * vendor, because the vendor lives entirely behind ATLAS_IDENTITY. Swapping
 * providers should not rename this file again.
 */
@Injectable()
export class TokenAtlasAuth extends AtlasAuth {
  private readonly client = inject(ATLAS_IDENTITY);
  // Field initializer: inject() is only legal in an injection context, and
  // init() is called later from an app initializer.
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentUser = signal<AuthUser | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  async init(): Promise<void> {
    // Subscribed BEFORE initialize(), so a session restored during it is not
    // missed between the two calls.
    this.destroyRef.onDestroy(this.client.onChange(() => this.sync()));
    await this.client.initialize();
    this.sync();
  }

  async login(hint: AtlasLoginHint = 'github'): Promise<void> {
    await this.client.signIn(hint);
  }

  async logout(): Promise<void> {
    await this.client.signOut();
    // Belt and braces: the client clears and notifies, and this guarantees the
    // console is signed out even if a listener was somehow missed.
    this.currentUser.set(null);
  }

  async getAccessToken(): Promise<string | null> {
    return this.client.accessToken();
  }

  /**
   * Re-derives the user from the CURRENT claims on every change, rather than
   * trusting the event that announced it. A refresh is where a server-side
   * revocation becomes visible: the new token simply stops carrying the admin
   * role, and reading it again is what makes that take effect instead of
   * persisting for the life of the tab.
   */
  private sync(): void {
    const claims = this.client.claims();
    this.currentUser.set(claims ? toAuthUser(claims) : null);
  }
}
