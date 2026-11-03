import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UiBadge, UiButton, UiBadgeTone } from '@atlas/shared-ui';
import { ATLAS_MANIFEST } from '../manifest.token';
import {
  REMOTE_STATUS_LABEL,
  RemoteHealth,
  RemoteHealthStore,
  RemoteStatus,
  UNKNOWN_REMOTE_HEALTH,
} from '../remotes/remote-health.store';

/** Bounded auto-retry: three attempts at 1s / 2s / 4s, then the user decides. */
const AUTO_RETRY_DELAYS_SECONDS: readonly number[] = [1, 2, 4];

/**
 * `returnUrl` is attacker-controllable — anyone can open
 * /unavailable/x?returnUrl=… by hand. Angular's Router would not leave the
 * origin, but only a single-slash absolute path is a real in-app destination;
 * protocol-relative ("//host") and anything else falls back to the remote's own
 * route so a hand-crafted link cannot strand the user somewhere odd.
 */
export function isInternalPath(url: string | null): url is string {
  return !!url && url.startsWith('/') && !url.startsWith('//');
}

const STATUS_TONE: Record<RemoteStatus, UiBadgeTone> = {
  unknown: 'neutral',
  loading: 'warning',
  ready: 'success',
  down: 'danger',
};

/**
 * The shell-owned error boundary for a remote that would not load, reached by
 * the navigation error handler (ADR-0007). Everything it shows is a signal:
 * the shell is zoneless, so a setTimeout that does not write a signal would
 * never repaint the countdown.
 */
@Component({
  selector: 'shell-module-unavailable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiBadge, UiButton],
  template: `
    @if (remote(); as name) {
      <section class="p-6" data-testid="remote-unavailable" [attr.data-remote]="name">
        <div class="mb-2 flex items-center gap-3">
          <h1 class="text-2xl font-semibold">{{ displayName() }} is unavailable</h1>
          <!-- While it is failed the heading has already said so; a retry is what is news. -->
          @if (health().status !== 'down') {
            <ui-badge [tone]="tone()">{{ statusLabel() }}</ui-badge>
          }
        </div>
        <p class="max-w-measure text-text-muted">
          This part of the platform could not be loaded right now. The rest of Atlas keeps
          working — try again in a moment.
        </p>

        <dl class="mt-5 grid max-w-prose grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt class="text-text-muted">Attempts</dt>
          <dd data-testid="remote-attempts">{{ health().attempts }}</dd>
          <dt class="text-text-muted">Failure</dt>
          <dd>{{ reasonLabel() }}</dd>
          @if (health().lastError; as lastError) {
            <dt class="text-text-muted">Details</dt>
            <dd class="font-mono text-xs text-on-danger" data-testid="remote-last-error">
              {{ lastError }}
            </dd>
          }
        </dl>

        <p class="mt-4 text-sm text-text-muted" role="status" data-testid="remote-retry-status">
          @if (countdown(); as seconds) {
            Retrying automatically in {{ seconds }}s…
          } @else if (health().status === 'loading') {
            Retrying now…
          } @else {
            Automatic retries are exhausted — retry when you are ready.
          }
        </p>

        <div class="mt-5 flex items-center gap-2">
          <ui-button data-testid="retry-remote" (pressed)="retry()">Retry</ui-button>
          @if (health().reason === 'module') {
            <ui-button data-testid="reload-page" variant="secondary" (pressed)="reload()">
              Reload page
            </ui-button>
          }
          <a
            class="inline-flex min-h-11 items-center px-2 text-sm text-text-muted underline hover:text-text md:min-h-0"
            routerLink="/"
          >
            Back to overview
          </a>
        </div>

        @if (health().reason === 'module') {
          <p class="mt-3 max-w-measure text-xs text-text-muted">
            The module's own code failed to download. The browser's module loader remembers that
            failure for the lifetime of the page, so this one needs a reload rather than a retry.
          </p>
        }
      </section>
    } @else {
      <section class="p-6" data-testid="route-not-found">
        <h1 class="mb-1 text-2xl font-semibold">Page not found</h1>
        <p class="max-w-measure text-text-muted">
          No domain in this platform owns that address. Pick one from the navigation, or
          <a class="underline hover:text-text" routerLink="/">go back to the overview</a>.
        </p>
      </section>
    }
  `,
})
export class ModuleUnavailable {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly manifest = inject(ATLAS_MANIFEST);
  private readonly healthStore = inject(RemoteHealthStore);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** Absent on the catch-all route, which renders the not-found copy instead. */
  protected readonly remote = computed(() => this.params().get('remote'));

  protected readonly health = computed((): RemoteHealth => {
    const name = this.remote();
    return (name ? this.healthStore.remotes()[name] : undefined) ?? UNKNOWN_REMOTE_HEALTH;
  });

  protected readonly displayName = computed(() => {
    const name = this.remote();
    return (name && this.manifest.remotes[name]?.displayName) || (name ?? 'This module');
  });

  protected readonly tone = computed(() => STATUS_TONE[this.health().status]);
  protected readonly statusLabel = computed(() => REMOTE_STATUS_LABEL[this.health().status]);

  protected readonly reasonLabel = computed(() => {
    switch (this.health().reason) {
      case 'entry':
        return 'The module could not be reached (remoteEntry.json)';
      case 'module':
        return "The module's code failed to load (chunk)";
      default:
        return 'Unknown';
    }
  });

  protected readonly countdown = signal<number | null>(null);

  private readonly autoRetries = signal(0);
  private lastRemote: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());

    // Re-arms after every failed retry: RemoteLoader flips the status back to
    // 'down', which is exactly the signal this effect waits on.
    effect(() => {
      const name = this.remote();
      const down = name !== null && this.health().status === 'down';
      untracked(() => {
        // DefaultRouteReuseStrategy keeps this instance across
        // /unavailable/a -> /unavailable/b, so a stale budget would otherwise
        // deny the new remote its automatic retries.
        if (name !== this.lastRemote) {
          this.lastRemote = name;
          this.cancel();
          this.autoRetries.set(0);
        }
        return down ? this.scheduleAutoRetry() : this.cancel();
      });
    });
  }

  /**
   * Re-runs the navigation that failed. The rejected loadChildren was never
   * cached by the router, so this re-invokes RemoteLoader.load — including
   * initRemoteEntry — with no page reload.
   */
  protected retry(): void {
    this.cancel();
    this.autoRetries.set(0);
    const name = this.remote();
    if (name) this.healthStore.resetAttempts(name);
    this.navigate();
  }

  protected reload(): void {
    location.reload();
  }

  private navigate(): void {
    // A failed retry comes back here through the navigation error handler; the
    // health store already recorded why, so nothing is swallowed silently.
    void this.router.navigateByUrl(this.returnUrl()).catch(() => undefined);
  }

  private returnUrl(): string {
    const name = this.remote();
    const route = name ? this.manifest.remotes[name]?.route : undefined;
    const fallback = route ? `/${route}` : '/';
    const requested = this.queryParams().get('returnUrl');
    return isInternalPath(requested) ? requested : fallback;
  }

  private scheduleAutoRetry(): void {
    if (this.timer !== null) return;
    const attempt = this.autoRetries();
    if (attempt >= AUTO_RETRY_DELAYS_SECONDS.length) return;
    this.tick(AUTO_RETRY_DELAYS_SECONDS[attempt]);
  }

  private tick(remaining: number): void {
    this.countdown.set(remaining);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (remaining > 1) {
        this.tick(remaining - 1);
        return;
      }
      this.countdown.set(null);
      this.autoRetries.update((n) => n + 1);
      this.navigate();
    }, 1000);
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.countdown.set(null);
  }
}
