import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AtlasAuth } from '@atlas/shared-auth';
import { RemoteDefinition } from '@atlas/shared-contracts';
import { UiBadge, UiButton, UiIcon, UiNavItem, UiThemeToggle } from '@atlas/shared-ui';
import { ATLAS_MANIFEST } from '../manifest.token';
import { RemoteHealthStore, RemoteStatus, UNKNOWN_REMOTE_HEALTH } from '../remotes/remote-health.store';

interface NavEntry extends RemoteDefinition {
  name: string;
  status: RemoteStatus;
  /** Whether the signed-in user's role satisfies `requiredRole`. */
  allowed: boolean;
}

@Component({
  selector: 'shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, UiBadge, UiButton, UiIcon, UiNavItem, UiThemeToggle],
  template: `
    <!--
      First focusable element in the document. Without it the tab order walks
      the whole sidebar — six stops — before reaching content, on every route,
      and a keyboard user pays that toll on every navigation.
    -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50
             focus:rounded-md focus:border focus:border-border-strong focus:bg-surface
             focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-text"
    >
      Skip to content
    </a>
    <div class="flex min-h-screen">
      <aside class="flex w-60 flex-col border-r border-border bg-surface">
        <div class="flex h-14 items-center gap-2 border-b border-border px-4">
          <ui-icon name="compass" [size]="22" />
          <span class="font-semibold tracking-tight">Atlas Admin</span>
        </div>
        <nav class="flex-1 space-y-1 p-3" aria-label="Primary">
          <ui-nav-item link="/" icon="overview" [exact]="true">Overview</ui-nav-item>
          @for (entry of navEntries(); track entry.route) {
            <!--
              Every remote in the manifest is listed, including ones this user
              may not open — they are disabled and wear the role they need.
              Hiding them was wrong twice over: the registry is fetched before
              authentication and publishes every remote with its requiredRole
              (ADR-0004), so there was nothing to conceal; and a signed-out
              visitor saw an empty sidebar under copy telling them to pick a
              domain from it.

              A DOWN remote is different and still keeps its href: that nav item
              IS the way back in, so it must stay clickable (ADR-0007).
            -->
            <div
              [attr.data-testid]="'nav-' + entry.name"
              [attr.data-health]="entry.status"
              [attr.data-allowed]="entry.allowed"
            >
              <ui-nav-item
                [link]="'/' + entry.route"
                [icon]="entry.icon"
                [disabled]="!entry.allowed"
              >
                {{ entry.displayName }}
                @if (!entry.allowed) {
                  <ui-badge>{{ entry.requiredRole }}</ui-badge>
                } @else if (entry.status === 'down') {
                  <ui-badge tone="danger">offline</ui-badge>
                }
              </ui-nav-item>
            </div>
          }
        </nav>
      </aside>
      <div class="flex flex-1 flex-col">
        <header
          class="flex h-14 items-center justify-end gap-3 border-b border-border bg-surface px-4"
        >
          @if (auth.user(); as user) {
            <span class="text-sm">{{ user.name }}</span>
            <ui-badge [tone]="user.role === 'admin' ? 'success' : 'neutral'">
              {{ user.role }}
            </ui-badge>
            <ui-button variant="secondary" (pressed)="auth.logout()">Sign out</ui-button>
          } @else {
            <ui-button (pressed)="auth.login('admin')">Sign in as admin</ui-button>
            <ui-button variant="secondary" (pressed)="auth.login('viewer')">as viewer</ui-button>
          }
          <ui-theme-toggle />
        </header>
        <!-- tabindex="-1" so the skip link can move focus here, not just scroll -->
        <main id="main-content" tabindex="-1" class="flex-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellLayout {
  private readonly manifest = inject(ATLAS_MANIFEST);
  private readonly health = inject(RemoteHealthStore);
  protected readonly auth = inject(AtlasAuth);

  // The manifest is the registry; the nav is a rendering of it. Every remote
  // appears, annotated with its live health and whether this user may enter —
  // the role gate decides whether the item is reachable, not whether it exists.
  readonly navEntries = computed((): NavEntry[] => {
    this.auth.user(); // re-evaluate on auth changes
    const health = this.health.remotes();
    return Object.entries(this.manifest.remotes).map(([name, def]) => ({
      ...def,
      name,
      status: (health[name] ?? UNKNOWN_REMOTE_HEALTH).status,
      allowed: this.auth.hasRole(def.requiredRole),
    }));
  });
}
