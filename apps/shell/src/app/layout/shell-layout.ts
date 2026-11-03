import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationSkipped, Router, RouterOutlet } from '@angular/router';
import { AtlasAuth } from '@atlas/shared-auth';
import { RemoteDefinition } from '@atlas/shared-contracts';
import { UiBadge, UiButton, UiIcon, UiNavItem, UiShortId, UiThemeToggle } from '@atlas/shared-ui';
import { DEMO_SESSION } from '../auth/demo-session';
import { IdentityFlow, providerName } from '../auth/identity-flow';
import { ATLAS_MANIFEST } from '../manifest.token';
import { ShellNotice } from '../notice/shell-notice';
import {
  REMOTE_STATUS_LABEL,
  RemoteHealthStore,
  RemoteStatus,
  UNKNOWN_REMOTE_HEALTH,
} from '../remotes/remote-health.store';

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
  host: {
    '(document:keydown.escape)': 'closeMenu()',
    '(document:keydown.tab)': 'keepTabInDrawer($event)',
    '(document:keydown.shift.tab)': 'keepTabInDrawer($event)',
  },
  imports: [NgTemplateOutlet, RouterOutlet, UiBadge, UiButton, UiIcon, UiNavItem, UiShortId, UiThemeToggle],
  template: `
    <!--
      First focusable element in the document. Without it the tab order walks
      the whole sidebar — six stops — before reaching content, on every route,
      and a keyboard user pays that toll on every navigation.
    -->
    <a
      href="#main-content"
      [inert]="menuOpen()"
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

        Open, it behaves as a modal: everything else is inert, so neither Tab nor a
        screen reader's swipe reaches the controls under the scrim, and Tab wraps
        here rather than leaving for the browser's own chrome.
      -->
      <aside
        id="primary-nav"
        class="fixed inset-y-0 left-0 z-40 flex w-60 -translate-x-full flex-col border-r
               border-border bg-surface invisible
               md:static md:visible md:translate-x-0"
        [class.!visible]="menuOpen()"
        [class.!translate-x-0]="menuOpen()"
        [attr.role]="menuOpen() ? 'dialog' : null"
        [attr.aria-modal]="menuOpen() ? 'true' : null"
        [attr.aria-label]="menuOpen() ? 'Navigation' : null"
      >
        <div class="flex h-14 items-center gap-2 border-b border-border px-4">
          <ui-icon name="compass" [size]="22" />
          <span class="font-semibold tracking-tight">Atlas Admin</span>
          <!-- The control that opened the drawer is under the scrim once it is open. -->
          <button
            type="button"
            data-testid="nav-close"
            aria-label="Close navigation"
            class="-mr-2 ml-auto inline-flex h-11 w-11 items-center justify-center rounded-md
                   transition-colors hover:bg-bg md:hidden"
            (click)="closeMenu()"
          >
            <ui-icon name="close" />
          </button>
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
                @if (entry.allowed && entry.status === 'down') {
                  <!--
                    Stacked, and only here. "unavailable" beside the name leaves
                    room for "Identity…"; this item growing a line is honest for a
                    state that is rare and needs noticing, and the name stays whole.
                  -->
                  <span class="flex min-w-0 flex-col items-start gap-1">
                    <span class="max-w-full truncate">{{ entry.displayName }}</span>
                    <ui-badge tone="danger">{{ unavailableLabel }}</ui-badge>
                  </span>
                } @else {
                  <span class="truncate">{{ entry.displayName }}</span>
                }
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
                }
              </ui-nav-item>
            </div>
          }
        </nav>
      </aside>
      <!--
        Dismisses the drawer on tap; never present at md and up. Out of the tab
        order, because the drawer's own close button already does this by keyboard.
      -->
      @if (menuOpen()) {
        <button
          type="button"
          data-testid="nav-backdrop"
          aria-label="Close navigation"
          tabindex="-1"
          class="fixed inset-0 z-30 bg-scrim/50 md:hidden"
          (click)="closeMenu()"
        ></button>
      }
      <div class="flex min-w-0 flex-1 flex-col" data-testid="console-column" [inert]="menuOpen()">
        <header
          class="flex h-14 items-center gap-2 border-b border-border bg-surface px-4 md:gap-3"
        >
          <button
            type="button"
            data-testid="nav-toggle"
            class="-ml-1 inline-flex h-11 w-11 items-center justify-center rounded-md
                   border border-border-strong transition-colors hover:bg-bg md:hidden"
            aria-controls="primary-nav"
            [attr.aria-expanded]="menuOpen()"
            aria-label="Open navigation"
            (click)="openMenu()"
          >
            <ui-icon name="menu" />
          </button>
          <!-- pushes the identity cluster right, replacing justify-end -->
          <span class="flex-1"></span>
          <!--
            On every route, because a screen that shows no label reads as real.
            Only mock mode has one: the Overview's registry reports http itself.
          -->
          @if (mockData) {
            <ui-badge class="shrink-0 whitespace-nowrap" data-testid="header-mock-data">mock data</ui-badge>
          }
          @if (demo?.active()) {
            <!--
              Checked before the user below, which also holds the demo visitor: no
              name and no role badge, since either would read as a real session.
            -->
            <ui-badge tone="warning" data-testid="header-demo">demo</ui-badge>
            <ui-button variant="secondary" (pressed)="exitDemo()">Exit demo</ui-button>
          } @else if (auth.user(); as user) {
            <!-- the name is the first thing to go when space is short; the
                 role badge is what actually changes what you can do -->
            @if (user.name === user.id) {
              <!--
                The token had no name or email, so the name is the raw id. Purely
                a display decision: nothing here reaches authorization.
              -->
              <span
                data-testid="identity-fallback"
                class="hidden items-center gap-2 text-sm sm:inline-flex"
              >
                <span class="text-text-muted">{{ accountLabel }}</span>
                <ui-short-id [value]="user.id" label="account ID" align="end" />
              </span>
            } @else {
              <span class="hidden max-w-64 truncate text-sm sm:inline" [attr.title]="user.name">
                {{ user.name }}
              </span>
            }
            <ui-badge [tone]="user.role === 'admin' ? 'success' : 'neutral'">
              {{ user.role }}
            </ui-badge>
            <ui-button variant="secondary" (pressed)="flow.signOut()">Sign out</ui-button>
          } @else {
            <ng-container [ngTemplateOutlet]="signIn" />
          }
          <ui-theme-toggle />
        </header>
        <ng-template #signIn>
          @if (identityProvider) {
            <!--
              Real identity: one button, and the hint is the PROVIDER name. The
              persona buttons below are not a different label for the same
              thing — they pass 'admin'/'viewer' as the login hint, which a real
              provider would read as the name of an OAuth provider and fail on.
            -->
            <!--
              aria-busy, not disabled: disabling the control just pressed would
              throw focus to <body>. The flow ignores a second press.
            -->
            <ui-button [busy]="flow.signingIn()" (pressed)="flow.signIn(identityProvider)">
              {{ flow.signingIn() ? 'Opening ' + providerLabel + '…' : 'Sign in with ' + providerLabel }}
            </ui-button>
          } @else {
            <!-- Mock only: the hint is a persona, and anyone may pick one. -->
            <!--
              "Sign in" leaves the screen below md, where the badge beside it needs the
              room, and stays in the button's name, which "as admin" alone would not explain.
            -->
            <ui-button (pressed)="flow.signIn('admin')">
              <span class="sr-only md:not-sr-only">Sign in </span>as admin
            </ui-button>
            <ui-button variant="secondary" (pressed)="flow.signIn('viewer')">as viewer</ui-button>
          }
        </ng-template>
        <!-- tabindex="-1" so the skip link can move focus here, not just scroll -->
        <main id="main-content" tabindex="-1" class="flex-1">
          <!--
            What the demo badge means, on every route. It is here rather than in
            the header because a phone has no room for it there. Always in the DOM
            so that starting the demo is announced, and collapsed the same way as
            the notice below while there is no demo.
          -->
          <div
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            [class.border-b]="demo?.active()"
            [class.border-border]="demo?.active()"
            [class.bg-surface]="demo?.active()"
            [class.px-6]="demo?.active()"
            [class.py-2]="demo?.active()"
          >
            <p
              role="status"
              aria-live="polite"
              data-testid="demo-strip"
              class="max-w-prose min-w-0 text-sm"
            >
              @if (demo?.active()) {
                Demo session, no account. Mock data, in this tab only. The edge BFF is not exercised,
                so nothing here proves authorization.
              }
            </p>
            @if (demo?.active()) {
              <div class="flex items-center gap-3">
                <ng-container [ngTemplateOutlet]="signIn" />
              </div>
            }
          </div>
          <!--
            The one place the shell reports what happened to the visitor's
            identity. The region is always in the DOM, because one inserted with
            its text is often not announced. It collapses to no height when
            silent rather than reserving a band: this is rare, and an empty strip
            on every screen would cost more than the shift when it does arrive.
            Dismiss sits outside the region so it is not read as part of the news.
          -->
          <div
            class="flex items-center gap-3"
            [class.border-b]="notice.current()"
            [class.border-border]="notice.current()"
            [class.bg-surface]="notice.current()"
            [class.px-6]="notice.current()"
          >
            <p
              role="status"
              aria-live="polite"
              data-testid="shell-notice"
              class="min-w-0 flex-1 text-sm"
              [class.py-2]="notice.current()"
              [class.text-on-danger]="notice.current()?.tone === 'problem'"
            >{{ notice.current()?.text }}</p>
            @if (notice.current()) {
              <button
                type="button"
                data-testid="shell-notice-dismiss"
                aria-label="Dismiss notice"
                class="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md
                       transition-colors hover:bg-bg md:h-7 md:w-7"
                (click)="dismissNotice()"
              >
                <ui-icon name="close" [size]="16" />
              </button>
            }
          </div>
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
  private readonly injector = inject(Injector);
  private readonly health = inject(RemoteHealthStore);
  protected readonly auth = inject(AtlasAuth);
  protected readonly notice = inject(ShellNotice);
  // Built here, before the router's initial navigation: see its constructor.
  protected readonly flow = inject(IdentityFlow);
  /** Null unless this deployment offers the demo (ADR-0015). */
  protected readonly demo = inject(DEMO_SESSION, { optional: true });
  protected readonly mockData = (this.manifest.apiMode ?? 'mock') === 'mock';

  /**
   * The configured OIDC provider, or null when this deployment runs the mock.
   *
   * Read from the manifest rather than from a build flag, because which
   * identity provider is in use is a deployment decision (ADR-0010) — the same
   * bundle serves a mock-auth preview and a real-auth production.
   */
  protected readonly identityProvider = this.manifest.auth?.provider ?? null;
  protected readonly providerLabel = providerName(this.identityProvider);
  protected readonly accountLabel = this.providerLabel ? `${this.providerLabel} account` : 'Account';

  protected readonly unavailableLabel = REMOTE_STATUS_LABEL.down;

  /** Drawer state. Only meaningful below md, where the sidebar is off-canvas. */
  protected readonly menuOpen = signal(false);

  constructor() {
    // A drawer that survives the navigation it just caused would cover the
    // screen the user asked for. Skipped counts: tapping the route already open
    // is still the user saying "this screen". The link they pressed is about to
    // be hidden, and the screen is what they asked for, so focus goes there.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (!(event instanceof NavigationEnd || event instanceof NavigationSkipped)) return;
      if (this.menuOpen()) this.setMenu(false, '#main-content');
    });

    // Widening past md with the drawer open would otherwise leave the whole
    // console inert behind a sidebar that no longer looks like a drawer.
    const desk = this.document.defaultView?.matchMedia?.('(min-width: 48rem)');
    const onDeskChange = (change: MediaQueryListEvent): void => {
      if (change.matches) this.menuOpen.set(false);
    };
    desk?.addEventListener('change', onDeskChange);
    inject(DestroyRef).onDestroy(() => desk?.removeEventListener('change', onDeskChange));
  }

  /** Moves into the panel: a drawer the keyboard cannot reach is decoration. */
  protected openMenu(): void {
    this.setMenu(true, '#primary-nav a[href]');
  }

  /** Hands focus back to the control that opened it, not the top of the document. */
  protected closeMenu(): void {
    if (this.menuOpen()) this.setMenu(false, '[data-testid="nav-toggle"]');
  }

  /**
   * The focus target is hidden or inert until the state has rendered, and focusing
   * either does nothing. So this waits for the render: a microtask runs before it,
   * which is how the drawer used to open with focus left behind on the toggle.
   */
  private setMenu(open: boolean, focusTarget: string): void {
    this.menuOpen.set(open);
    afterNextRender(
      { read: () => this.document.querySelector<HTMLElement>(focusTarget)?.focus() },
      { injector: this.injector }
    );
  }

  /** Inert keeps Tab out of the console; this keeps it out of the browser's chrome. */
  protected keepTabInDrawer(event: Event): void {
    if (!this.menuOpen()) return;
    const stops = Array.from(
      this.document.querySelectorAll<HTMLElement>('#primary-nav a[href], #primary-nav button')
    );
    const first = stops[0];
    const last = stops[stops.length - 1];
    const backwards = (event as KeyboardEvent).shiftKey;
    const leaving = backwards
      ? this.document.activeElement === first
      : this.document.activeElement === last;
    if (!leaving) return;
    event.preventDefault();
    (backwards ? last : first)?.focus();
  }

  protected async exitDemo(): Promise<void> {
    await this.flow.signOut();
    // The button just pressed is gone; without this focus falls to <body>.
    this.document.querySelector<HTMLElement>('#main-content')?.focus();
  }

  protected dismissNotice(): void {
    this.notice.clear();
    // The button just removed held focus; without this it falls to <body>.
    this.document.querySelector<HTMLElement>('#main-content')?.focus();
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
