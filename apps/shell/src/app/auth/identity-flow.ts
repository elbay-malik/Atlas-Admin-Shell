import { Location } from '@angular/common';
import { DOCUMENT, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { NavigationStart, Router, UrlTree } from '@angular/router';
import { AtlasAuth, AuthUser } from '@atlas/shared-auth';
import { RemoteDefinition } from '@atlas/shared-contracts';
import { ATLAS_MANIFEST } from '../manifest.token';
import { ShellNotice } from '../notice/shell-notice';
import { ATLAS_IDENTITY, IdentityIssue } from './identity.port';
import { forgetIntendedRoute, rememberIntendedRoute, takeIntendedRoute } from './intended-route';

/**
 * How long the sign-in button stays busy. A successful sign-in leaves the page
 * well before this, so reaching it means the redirect never got anywhere.
 */
export const SIGN_IN_STALL_MS = 15_000;

/** Provider ids whose proper name is not just the id with a capital. */
const PROVIDER_NAMES: Record<string, string> = { github: 'GitHub' };

export function providerName(provider: string | null): string {
  if (!provider) return '';
  return PROVIDER_NAMES[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * The transitions of a session, and what the visitor is told about each.
 *
 * Route guards run once, during recognition. Nothing re-runs them when a session
 * ends under a page that has already matched, so without this a signed-out
 * visitor keeps the screen they were on. This re-checks the route whenever the
 * user or their role changes.
 *
 * This is UX. The edge BFF is what refuses the data (ADR-0011); a redirect or a
 * notice is never a security boundary. The role read here is the one AtlasAuth
 * holds, which comes only from toAtlasRole.
 */
@Injectable({ providedIn: 'root' })
export class IdentityFlow {
  private readonly auth = inject(AtlasAuth);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notice = inject(ShellNotice);
  private readonly identity = inject(ATLAS_IDENTITY, { optional: true });
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly provider = providerName(inject(ATLAS_MANIFEST).auth?.provider ?? null);

  private previous = this.auth.user();
  private signingOut = false;
  /** Set while the flow re-checks a route, so routeDeclined stays quiet. */
  private recheck: 'signed-out' | 'session-lost' | 'role-changed' | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly signingInState = signal(false);
  readonly signingIn = this.signingInState.asReadonly();

  constructor() {
    // Runs before the router's initial navigation, which is what makes both of
    // these work: the notice is not cleared by it, and the route it reads is
    // the one set here, with no flash of the overview first.
    this.reportIssue(this.identity?.takeIssue() ?? null);
    if (this.previous && this.isAtOverview(this.location.path())) {
      const intended = takeIntendedRoute();
      if (intended) this.location.replaceState(intended);
    }

    effect(() => {
      const user = this.auth.user();
      untracked(() => this.onUserChange(user));
    });

    // A notice describes the moment it was written, so moving on retires it.
    // Not the initial navigation (id 1), which is the moment it describes.
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart && event.id > 1) this.notice.clear();
    });

    // Back from the provider's page via the browser's cache: the page is
    // restored exactly as it left, button still busy.
    this.window?.addEventListener('pageshow', (event) => {
      if (event.persisted) this.endSignIn();
    });
  }

  /** `hint` is opaque here: a persona for the mock, a provider id for a real one. */
  async signIn(hint: string): Promise<void> {
    if (this.signingInState()) return;
    this.notice.clear();
    this.signingInState.set(true);
    this.stallTimer = setTimeout(() => {
      this.endSignIn();
      this.notice.show(
        `${this.provider || 'Sign-in'} did not open. The identity provider may be waking up, so try again in a minute.`,
        'problem'
      );
    }, SIGN_IN_STALL_MS);
    try {
      await this.auth.login(hint);
      // A real provider has started navigating away by now, so stay busy.
      if (this.auth.user()) this.endSignIn();
    } catch (error) {
      console.error('Sign-in could not be started', error);
      this.endSignIn();
      this.notice.show('Sign-in could not be started. Try again.', 'problem');
    }
  }

  async signOut(): Promise<void> {
    this.signingOut = true;
    await this.auth.logout();
  }

  /**
   * A protected route declined this visitor. Says why, remembers where they were
   * going if signing in could still get them there, and sends them to the
   * overview.
   */
  routeDeclined(remote: Pick<RemoteDefinition, 'displayName' | 'requiredRole'>): UrlTree {
    const user = this.auth.user();
    if (user) {
      this.notice.show(
        `${remote.displayName} requires the ${remote.requiredRole} role; you are a ${user.role}.`
      );
    } else {
      if (this.recheck !== 'signed-out') {
        const attempted = this.router.currentNavigation()?.extractedUrl;
        if (attempted) rememberIntendedRoute(this.router.serializeUrl(attempted));
      }
      // Not over a boot failure, which explains more than this would.
      if (!this.recheck && !this.notice.current()) {
        this.notice.show(`Sign in to open ${remote.displayName}.`);
      }
    }
    return this.router.parseUrl('/');
  }

  private onUserChange(user: AuthUser | null): void {
    const previous = this.previous;
    this.previous = user;
    if (previous?.id === user?.id && previous?.role === user?.role) return;

    if (previous && !user) {
      const signedOut = this.signingOut;
      this.signingOut = false;
      if (signedOut) forgetIntendedRoute();
      void this.recheckRoute(signedOut ? 'signed-out' : 'session-lost').then(() =>
        this.notice.show(signedOut ? 'Signed out.' : 'Your session ended.')
      );
    } else if (!previous && user) {
      this.endSignIn();
      this.notice.clear();
      const intended = takeIntendedRoute();
      if (intended && this.isAtOverview(this.router.url)) void this.router.navigateByUrl(intended);
    } else {
      // Same session, different authority: a refresh is where a revoked role
      // becomes visible (see TokenAtlasAuth.sync).
      void this.recheckRoute('role-changed');
    }
  }

  /** Runs recognition again, so canMatch sees the session as it is now. */
  private async recheckRoute(reason: NonNullable<IdentityFlow['recheck']>): Promise<void> {
    this.recheck = reason;
    try {
      await this.router.navigateByUrl(this.router.url, {
        onSameUrlNavigation: 'reload',
        replaceUrl: true,
      });
    } catch (error) {
      // The notice still has to be said, and the remote's own guards still hold.
      console.error('The route could not be re-checked', error);
    } finally {
      this.recheck = null;
    }
  }

  private reportIssue(issue: IdentityIssue | null): void {
    if (!issue) return;
    const name = this.provider || 'the provider';
    switch (issue.kind) {
      case 'sign-in-rejected':
        this.notice.show(
          issue.code
            ? `Sign-in with ${name} failed: ${issue.code}. Try again.`
            : `Sign-in with ${name} could not be completed. Try again.`,
          'problem'
        );
        return;
      case 'provider-unreachable':
        this.notice.show(
          issue.during === 'sign-in'
            ? 'The identity provider did not answer, so sign-in has not finished. It may be waking up: reload in a minute to try again.'
            : 'The identity provider did not answer, so your session could not be restored. It may be waking up: reload in a minute to try again.',
          'problem'
        );
        return;
      case 'session-expired':
        this.notice.show('Your session ended.');
        return;
    }
  }

  private endSignIn(): void {
    if (this.stallTimer !== null) clearTimeout(this.stallTimer);
    this.stallTimer = null;
    this.signingInState.set(false);
  }

  private isAtOverview(path: string): boolean {
    return path === '' || path === '/';
  }
}
