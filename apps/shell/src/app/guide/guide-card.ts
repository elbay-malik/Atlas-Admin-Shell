import { DOCUMENT } from '@angular/common';
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
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { UiButton, UiIcon } from '@atlas/shared-ui';
import { DEMO_SESSION } from '../auth/demo-session';
import { providerName } from '../auth/identity-flow';
import { ATLAS_MANIFEST } from '../manifest.token';
import { FirstVisitGuide } from './first-visit-guide';

/**
 * Room for the whole card without hiding the Overview's registry: Tailwind's `sm`
 * wide and 800px tall. A phone, or a 1280×720 laptop, gets the one-line bar.
 */
const ROOMY_QUERY = '(min-width: 40rem) and (min-height: 50rem)';

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What to try first, for a visitor who has a few seconds. It says what the
 * screen cannot show on its own: that each domain is a separate app loaded at
 * runtime. Non-blocking by design: no backdrop, it takes focus only when the
 * visitor asks for it, and Escape closes it only from inside it, so it never
 * swallows the Escape that cancels a confirmation or closes the drawer.
 */
@Component({
  selector: 'shell-guide-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiIcon],
  template: `
    @if (visible()) {
      <!--
        The first floating surface in the system. Flat, like everything else:
        surface tone and the strong hairline, with no shadow (DESIGN.md, Elevation).
      -->
      <section
        data-testid="guide-card"
        tabindex="-1"
        aria-labelledby="guide-title"
        [attr.data-expanded]="full()"
        class="fixed right-4 bottom-4 left-4 z-20 max-h-[50vh] overflow-y-auto rounded-md border
               border-border-strong bg-surface text-text sm:left-auto sm:max-h-none sm:w-96"
        [class.p-4]="full()"
        [class.px-4]="!full()"
        [class.py-2]="!full()"
        (keydown.escape)="close()"
      >
        @if (full()) {
          <h2 id="guide-title" class="text-sm font-semibold">What to try</h2>
          <ol class="mt-2 list-decimal space-y-2 pl-5 text-sm text-pretty" data-testid="guide-steps">
            @for (step of steps; track $index) {
              <li>{{ step }}</li>
            }
          </ol>
          <div class="mt-3 flex flex-wrap gap-2">
            <ui-button variant="secondary" data-testid="guide-close" (pressed)="close()">Close</ui-button>
            <ui-button variant="secondary" data-testid="guide-dismiss" (pressed)="dismiss()">
              Don't show again
            </ui-button>
          </div>
        } @else {
          <!-- A phone's first view: one line, so the Overview's own controls stay in sight. -->
          <div class="flex items-center gap-2">
            <h2 id="guide-title" class="min-w-0 flex-1 text-sm font-semibold">New here?</h2>
            <ui-button variant="secondary" data-testid="guide-expand" (pressed)="expand()">
              What to try
            </ui-button>
            <button
              type="button"
              data-testid="guide-close-bar"
              aria-label="Close the guide"
              class="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md
                     transition-colors hover:bg-bg"
              (click)="close()"
            >
              <ui-icon name="close" [size]="16" />
            </button>
          </div>
        }
      </section>
    }
  `,
})
export class GuideCard {
  private readonly guide = inject(FirstVisitGuide);
  private readonly manifest = inject(ATLAS_MANIFEST);
  private readonly demo = inject(DEMO_SESSION, { optional: true });
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly roomy = signal(true);
  private readonly onOverview = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.isOverview())
    ),
    { initialValue: this.isOverview() }
  );

  protected readonly visible = computed(
    () => this.guide.open() && (this.roomy() || this.onOverview() || this.guide.requested())
  );

  /** A roomy screen, or anywhere the visitor asked: the whole card. */
  protected readonly full = computed(() => this.roomy() || this.guide.expanded());

  protected readonly steps = this.buildSteps();

  constructor() {
    const query = this.document.defaultView?.matchMedia?.(ROOMY_QUERY);
    if (query) {
      this.roomy.set(query.matches);
      const onChange = (change: MediaQueryListEvent) => this.roomy.set(change.matches);
      query.addEventListener('change', onChange);
      this.host.onDestroy(() => query.removeEventListener('change', onChange));
    }
  }

  /** The visitor asked for it, so focus goes with them into the card. */
  protected expand(): void {
    this.guide.expand();
    afterNextRender(
      { read: () => this.document.querySelector<HTMLElement>('[data-testid="guide-card"]')?.focus() },
      { injector: this.injector }
    );
  }

  protected close(): void {
    this.leave(() => this.guide.close());
  }

  protected dismiss(): void {
    this.leave(() => this.guide.dismiss());
  }

  /** The card is about to leave with focus inside it; without this, focus falls to <body>. */
  private leave(action: () => void): void {
    const card = this.document.querySelector('[data-testid="guide-card"]');
    const hadFocus = !!card && card.contains(this.document.activeElement);
    action();
    if (hadFocus) this.document.querySelector<HTMLElement>('#main-content')?.focus();
  }

  private isOverview(): boolean {
    return this.router.url.split(/[?#]/)[0] === '/';
  }

  /** From the manifest, so the text names this deployment's domains and nothing it lacks. */
  private buildSteps(): string[] {
    const remotes = this.manifest.remotes;
    const names = Object.values(remotes).map((remote) => remote.displayName);
    const adminOnly = Object.values(remotes)
      .filter((remote) => remote.requiredRole === 'admin')
      .map((remote) => remote.displayName);
    const provider = providerName(this.manifest.auth?.provider ?? null);
    const waking =
      this.manifest.auth?.kind === 'nhost' ? 'the free Nhost project wakes up' : 'the identity provider wakes up';

    const first: string[] = [];
    if (this.demo) {
      first.push(
        'Press Explore with demo data to look around as an admin on mock data, with no account.'
      );
    }
    if (provider) {
      const viewer = adminOnly.length
        ? `a new account is a viewer and can't open ${listed(adminOnly)}`
        : 'a new account is a viewer';
      first.push(
        `${this.demo ? `${provider} sign-in works too, but` : `Sign in with ${provider} from the header:`} ${viewer}. Sign-in may be slow while ${waking}.`
      );
    } else if (!this.demo) {
      first.push(
        adminOnly.length
          ? `Sign in as admin from the header: a viewer can't open ${listed(adminOnly)}.`
          : 'Sign in from the header.'
      );
    }

    const steps = [
      first.join(' '),
      `Open ${listed(names)}. Each is a separate app, deployed on its own and loaded by this shell when you first open it.`,
    ];
    const iam = remotes['iam'];
    const audit = remotes['audit-logs'];
    if (iam && audit) {
      steps.push(
        `Change a role in ${iam.displayName}, then open ${audit.displayName}. The change arrives there as an event from the other app.`
      );
    }
    return steps;
  }
}
