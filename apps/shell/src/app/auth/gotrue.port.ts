import { InjectionToken } from '@angular/core';

/**
 * The only slice of Supabase's auth client this shell consumes.
 *
 * Narrowing it to a port is what makes the provider testable with no Supabase
 * project: the specs bind a hand-written fake to this token. It also documents
 * exactly how much of the vendor surface the platform depends on — six methods.
 */
export interface GoTrueLike {
  /** With skipAutoInitialize, this covers session restore AND the OAuth redirect callback. */
  initialize(): Promise<{ error: { message: string } | null }>;

  getClaims(): Promise<
    | { data: { claims: Record<string, unknown> }; error: null }
    | { data: null; error: { message: string } | null }
  >;

  getSession(): Promise<{ data: { session: { access_token: string } | null } }>;

  onAuthStateChange(
    callback: (event: string, session: { access_token: string } | null) => void
  ): { data: { subscription: { unsubscribe(): void } } };

  signInWithOAuth(credentials: {
    provider: string;
    options?: { redirectTo?: string; scopes?: string };
  }): Promise<{ error: { message: string } | null }>;

  signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{
    error: { message: string } | null;
  }>;
}

export const GO_TRUE = new InjectionToken<GoTrueLike>('atlas.gotrue');
