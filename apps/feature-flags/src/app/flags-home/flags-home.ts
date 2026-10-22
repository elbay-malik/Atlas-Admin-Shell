import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { UiBadge, UiButton } from '@atlas/shared-ui';
import { FlagsStore } from '../data/flags.store';

@Component({
  selector: 'flags-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiBadge, UiButton],
  template: `
    <section class="p-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="mb-1 text-2xl font-semibold">Feature Flags</h1>
          <!--
            Was "Toggle features per environment", which promised a control
            this screen does not have. The environment is chosen at deploy time
            by which manifest ships (ADR-0010), so it is not the operator's to
            pick here.
          -->
          <p class="text-text-muted">Toggle features for this deployment.</p>
        </div>
        <div class="flex items-center gap-2">
          @if (!canEdit()) {
            <ui-badge data-testid="flags-readonly">read-only</ui-badge>
          }
          <ui-badge
            data-testid="flags-summary"
            [tone]="store.enabledCount() > 0 ? 'success' : 'neutral'"
          >
            {{ store.enabledCount() }} of {{ total() }} enabled
          </ui-badge>
        </div>
      </header>

      @if (store.error(); as message) {
        <div
          data-testid="flags-error"
          role="alert"
          class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border
                 border-status-danger/40 bg-surface p-4"
        >
          <p class="text-sm text-on-danger">{{ message }}</p>
          <ui-button variant="secondary" (pressed)="store.load()">Retry</ui-button>
        </div>
      }

      @if (store.isPending()) {
        <p data-testid="flags-loading" class="text-sm text-text-muted">Loading feature flags…</p>
      } @else if (total() === 0) {
        <p class="text-sm text-text-muted">No feature flags are defined for this environment.</p>
      }

      <ul class="space-y-3">
        @for (flag of store.entities(); track flag.key) {
          <li
            data-testid="flag-row"
            [attr.data-flag-key]="flag.key"
            class="flex items-center justify-between gap-4 border-b border-border pb-3"
          >
            <div>
              <code class="text-sm">{{ flag.key }}</code>
              <p class="text-sm text-text-muted">{{ flag.description }}</p>
            </div>
            <!--
              aria-busy rather than disabled: disabling the control the user just
              activated moves focus to <body> and loses their place in the list.
              The store's in-flight guard swallows a duplicate write instead.
            -->
            <button
              type="button"
              data-testid="flag-toggle"
              [disabled]="!canEdit()"
              [attr.title]="canEdit() ? null : 'Only admins can change feature flags'"
              class="min-h-11 rounded-md border border-border-strong px-4 py-1 text-sm font-medium
                     transition-colors hover:border-brand-primary disabled:cursor-not-allowed
                     disabled:opacity-50 aria-pressed:border-brand-primary
                     aria-pressed:bg-brand-primary aria-pressed:text-white md:min-h-0 md:px-3"
              [attr.aria-pressed]="flag.enabled"
              [attr.aria-label]="(flag.enabled ? 'On' : 'Off') + ', toggle ' + flag.key"
              [attr.data-pending]="isPending(flag.key)"
              [attr.aria-busy]="isPending(flag.key)"
              (click)="store.toggle(flag.key)"
            >
              {{ flag.enabled ? 'On' : 'Off' }}
            </button>
          </li>
        }
      </ul>
    </section>
  `,
})
export class FlagsHome {
  private readonly auth = inject(AtlasAuth);
  protected readonly store = inject(FlagsStore);
  protected readonly total = computed(() => this.store.entities().length);

  /**
   * Flag writes are admin-only. This screen is viewer-visible per the manifest,
   * and until the BFF landed a viewer could actually toggle a flag — the UI
   * never checked. This hides the affordance; the edge is what enforces it
   * (ADR-0011), because a hidden button stops nobody with a terminal.
   */
  protected readonly canEdit = computed(() => {
    this.auth.user();
    return this.auth.hasRole('admin');
  });

  /** True while this row's write is in flight — only that row is disabled. */
  protected isPending(key: string): boolean {
    return this.store.pendingKeys().includes(key);
  }
}
