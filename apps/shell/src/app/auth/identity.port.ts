import { InjectionToken } from '@angular/core';

/**
 * The only slice of an identity provider this shell consumes.
 *
 * Narrowing it to a port is what makes the provider testable with no identity
 * project at all: the specs bind a hand-written fake to this token. It also
 * documents exactly how much vendor surface the platform depends on — seven
 * methods, none of them vendor-shaped.
 *
 * The previous version of this port was shaped around one vendor's SDK, down to
 * its `{ data, error }` wrappers and its subscription object. That shape was
 * invisible until the vendor changed, at which point it was the thing standing
 * in the way. This one is expressed in the terms the SHELL needs, so the next
 * swap is an adapter rather than a refactor.
 */
export type IdentityIssue =
  /**
   * The provider refused the sign-in. `code` is its short machine code when it
   * sent one. Free text from the redirect is never carried here: anyone can
   * craft that URL, so showing it would let a link write into the console.
   */
  | { kind: 'sign-in-rejected'; code: string | null }
  /** The provider did not answer. The token was kept, so a reload can retry. */
  | { kind: 'provider-unreachable'; during: 'sign-in' | 'restore' }
  /** A stored session is no longer accepted. */
  | { kind: 'session-expired' };

export interface AtlasIdentityClient {
  /**
   * Restores a stored session and/or completes a redirect. Resolves normally
   * when nobody is signed in — being signed out is not an error — and also when
   * the attempt failed, because the console must boot either way. A failure is
   * reported through `takeIssue()`.
   */
  initialize(): Promise<void>;

  /** What went wrong during `initialize()`, once; null when nothing did. */
  takeIssue(): IdentityIssue | null;

  /**
   * Claims of the current access token, or null when signed out.
   *
   * These are READ, not trusted. Nothing here verifies a signature: the token
   * is opaque to the browser and the edge BFF is what decides whether it is
   * real (ADR-0011). Claims drive what the console SHOWS, never what it is
   * allowed to do.
   */
  claims(): Record<string, unknown> | null;

  /** A usable access token, refreshing first if the current one is near expiry. */
  accessToken(): Promise<string | null>;

  /** Subscribes to sign-in, sign-out and refresh. Returns an unsubscribe. */
  onChange(listener: () => void): () => void;

  /**
   * Starts a provider redirect. On success the tab is already navigating away,
   * so this resolves only when the redirect could not be started.
   */
  signIn(provider: string): Promise<void>;

  signOut(): Promise<void>;
}

export const ATLAS_IDENTITY = new InjectionToken<AtlasIdentityClient>('atlas.identity');
