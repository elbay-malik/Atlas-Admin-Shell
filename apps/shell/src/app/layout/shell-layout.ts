import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
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
  // Escape closes the drawer from anywhere inside it, which is what a keyboard
  // user reaches for before hunting back to the toggle.
  host: { '(document:keydown.escape)': 'closeMenu()' },
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
      <!--
        Below md the sidebar is off-canvas. "invisible" rather than only a
        translate: visibility:hidden takes the whole panel out of the tab order
        and the accessibility tree, so a closed drawer cannot be tabbed into —
        which a transform alone would not prevent.

        No slide transition, deliberately. DESIGN.md's motion vocabulary is
        colour only; a drawer that animates its geometry would be the first
        thing in the system to move, and an instant panel is also the one that
        cannot be caught half-open by a fast tap.
      -->
      <aside
        id="primary-nav"
        class="fixed inset-y-0 left-0 z-40 flex w-60 -translate-x-full flex-col border-r
               border-border bg-surface invisible
               md:static md:visible md:translate-x-0"
        [class.!visible]="menuOpen()"
        [class.!translate-x-0]="menuOpen()"
      >
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
              [attr.title]="entry.allowed ? null : 'Requires the ' + entry.requiredRole + ' role'"
            >
              <ui-nav-item
                [link]="'/' + entry.route"
                [icon]="entry.icon"
                [disabled]="!entry.allowed"
              >
                <span class="truncate">{{ entry.displayName }}</span>
                @if (!entry.allowed) {
                  <!--
                    A lock, plus the reason in text only a screen reader hears.
                    The word "admin" as a visible badge pushed long labels onto
                    a second line; truncating them to fit was worse still. The
                    mark costs 16px, the sr-only text costs nothing, and the
                    Overview spells the requirement out in full.
                  -->
                  <ui-icon name="lock" [size]="16" />
                  <span class="sr-only">Requires the {{ entry.requiredRole }} role</span>
                } @else if (entry.status === 'down') {
                  <ui-badge tone="danger">offline</ui-badge>
                }
              </ui-nav-item>
            </div>
          }
        </nav>
      </aside>
      <!-- Dismisses the drawer on tap; never present at md and up. -->
      @if (menuOpen()) {
        <button
          type="button"
          data-testid="nav-backdrop"
          aria-label="Close navigation"
          class="fixed inset-0 z-30 bg-scrim/50 md:hidden"
          (click)="closeMenu()"
        ></button>
      }
      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex h-14 items-center gap-3 border-b border-border bg-surface px-4"
        >
          <button
            type="button"
            data-testid="nav-toggle"
            class="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md
                   border border-border-strong transition-colors hover:bg-bg md:hidden"
            aria-controls="primary-nav"
            [attr.aria-expanded]="menuOpen()"
            [attr.aria-label]="menuOpen() ? 'Close navigation' : 'Open navigation'"
            (click)="toggleMenu()"
          >
            <ui-icon [name]="menuOpen() ? 'close' : 'menu'" />
          </button>
          <!-- pushes the identity cluster right, replacing justify-end -->
          <span class="flex-1"></span>
          @if (auth.user(); as user) {
            <!-- the name is the first thing to go when space is short; the
                 role badge is what actually changes what you can do -->
            <span class="hidden text-sm sm:inline">{{ user.name }}</span>
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
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly health = inject(RemoteHealthStore);
  protected readonly auth = inject(AtlasAuth);

  /** Drawer state. Only meaningful below md, where the sidebar is off-canvas. */
  protected readonly menuOpen = signal(false);

  constructor() {
    // A drawer that survives the navigation it just caused would cover the
    // screen the user asked for.
    this.router.events
      .pipe(takeUntilDestroyed())
      .subscribe((event) => event instanceof NavigationEnd && this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
    // Opening moves focus into the panel; a drawer the keyboard cannot reach is
    // decoration. Closing hands focus back to the control that opened it, so
    // the user does not land at the top of the document.
    queueMicrotask(() => {
      const target = this.menuOpen()
        ? this.document.querySelector<HTMLElement>('#primary-nav a')
        : this.document.querySelector<HTMLElement>('[data-testid="nav-toggle"]');
      target?.focus();
    });
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.document.querySelector<HTMLElement>('[data-testid="nav-toggle"]')?.focus();
  }

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
