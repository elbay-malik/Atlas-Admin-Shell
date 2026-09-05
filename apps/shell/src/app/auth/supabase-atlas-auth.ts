import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AtlasAuth, AtlasLoginHint, AuthUser } from '@atlas/shared-auth';
import { toAuthUser } from './claims';
import { GO_TRUE } from './gotrue.port';

/**
 * The real identity provider, satisfying the same AtlasAuth contract as the
 * mock (ADR-0006). It lives in the SHELL, not in @atlas/shared-auth: adding a
 * Supabase-importing file to that lib's barrel would pull the client into every
 * remote's shared set, because each remote's entry graph already reaches the
 * lib. Only the abstract token crosses the federation boundary.
 */
@Injectable()
export class SupabaseAtlasAuth extends AtlasAuth {
  private readonly client = inject(GO_TRUE);
  // Field initializer: inject() is only legal in an injection context, and
  // init() is called later from an app initializer.
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentUser = signal<AuthUser | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  async init(): Promise<void> {
    // The callback must stay synchronous: the async overload is deprecated
    // because awaiting inside it deadlocks against a nested token refresh.
    const { data } = this.client.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        this.currentUser.set(null);
        return;
      }
      // Re-verify OUTSIDE the callback, never within it.
      queueMicrotask(() => void this.refreshClaims());
    });
    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());

    // With skipAutoInitialize this single await covers both restoring a stored
    // session and completing an OAuth redirect, which is exactly what the
    // interface's async init() seam was designed for.
    const { error } = await this.client.initialize();
    if (error) {
      console.error('[atlas-auth] initialize failed', error.message);
    }
    await this.refreshClaims();
  }

  async login(hint: AtlasLoginHint = 'github'): Promise<void> {
    const { error } = await this.client.signInWithOAuth({
      provider: hint,
      options: { redirectTo: `${location.origin}/` },
    });
    // On success the tab is already navigating away, so only failure returns.
    if (error) throw new Error(error.message);
  }

  async logout(): Promise<void> {
    // 'local' signs out this browser only; a global sign-out would revoke other
    // devices, which is a different product decision than a Sign out button.
    const { error } = await this.client.signOut({ scope: 'local' });
    // Clear locally regardless: a failed network call must not leave the console
    // appearing signed in.
    this.currentUser.set(null);
    if (error) console.warn('[atlas-auth] signOut failed', error.message);
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.client.getSession();
    return data.session?.access_token ?? null;
  }

  private async refreshClaims(): Promise<void> {
    const { data, error } = await this.client.getClaims();
    if (error || !data) {
      this.currentUser.set(null);
      return;
    }
    this.currentUser.set(toAuthUser(data.claims));
  }
}
