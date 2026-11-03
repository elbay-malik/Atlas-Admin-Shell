import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { UiActionStatus, UiBadge, UiButton, UiPageHeader } from '@atlas/shared-ui';
import { FeatureFlag } from '../data/flags-api';
import { FlagsStore } from '../data/flags.store';

@Component({
  selector: 'flags-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiActionStatus, UiBadge, UiButton, UiPageHeader],
  template: `
    <section class="p-6">
      <ui-page-header heading="Feature Flags">
        <!--
          Was "Toggle features per environment", which promised a control
          this screen does not have. The environment is chosen at deploy time
          by which manifest ships (ADR-0010), so it is not the operator's to
          pick here. A viewer's line says what they can do with it: read it.
        -->
        <p data-testid="flags-intro">
          {{ canEdit() ? 'Toggle features for this deployment.' : 'See which features are on for this deployment.' }}
        </p>
        @if (!canEdit()) {
          <p uiPageNote id="flags-readonly-reason" data-testid="flags-readonly-reason">
            Only admins can change feature flags.
          </p>
        }
        @if (!canEdit()) {
          <ui-badge data-testid="flags-readonly">read-only</ui-badge>
        }
        <ui-badge
          data-testid="flags-summary"
          [tone]="store.enabledCount() > 0 ? 'success' : 'neutral'"
        >
          {{ store.enabledCount() }} of {{ total() }} enabled
        </ui-badge>
        <ui-action-status
          [status]="store.lastToggle()"
          (undo)="undo()"
          (expired)="store.dismissLastToggle()"
        />
      </ui-page-header>

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
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border pb-3"
          >
            <div class="min-w-0 flex-1">
              <code class="text-sm">{{ flag.key }}</code>
              <p class="text-sm text-text-muted">{{ flag.description }}</p>
            </div>
            <!--
              aria-busy rather than disabled: disabling the control the user just
              activated moves focus to <body> and loses their place in the list.
              The store's in-flight guard swallows a duplicate write instead.
            -->
            <ui-button
              data-testid="flag-toggle"
              variant="secondary"
              [disabled]="!canEdit()"
              [describedBy]="canEdit() ? null : 'flags-readonly-reason'"
              [expanded]="flag.blastRadius ? confirming() === flag.key : null"
              [toggled]="flag.enabled"
              [ariaLabel]="(flag.enabled ? 'On' : 'Off') + ', toggle ' + flag.key"
              [attr.data-pending]="isPending(flag.key)"
              [busy]="isPending(flag.key)"
              (pressed)="pressToggle(flag)"
            >
              {{ flag.enabled ? 'On' : 'Off' }}
            </ui-button>
            <!--
              Undo answers a mistake only the operator has seen. A flag marked
              with a blast radius reaches other people the moment it flips, so it
              asks first: in the row, where the consequence can be read, and with
              focus on the choice that changes nothing.
            -->
            @if (confirming() === flag.key && canEdit()) {
              <div
                role="group"
                data-testid="flag-confirm"
                class="flex w-full flex-wrap items-center gap-x-4 gap-y-2"
                [attr.aria-labelledby]="'flag-confirm-' + flag.key"
                (keydown.escape)="cancelConfirm(flag.key)"
              >
                <p [attr.id]="'flag-confirm-' + flag.key" class="min-w-0 text-sm">
                  Turn {{ flag.enabled ? 'off' : 'on' }} {{ flag.key }}?
                  <span class="text-text-muted">{{ flag.blastRadius }}</span>
                </p>
                <div class="flex flex-wrap gap-2">
                  <ui-button
                    data-testid="flag-confirm-cancel"
                    variant="secondary"
                    (pressed)="cancelConfirm(flag.key)"
                  >
                    Keep it {{ flag.enabled ? 'on' : 'off' }}
                  </ui-button>
                  <ui-button
                    data-testid="flag-confirm-commit"
                    variant="danger"
                    (pressed)="commitConfirm(flag.key)"
                  >
                    Turn {{ flag.enabled ? 'off' : 'on' }} {{ flag.key }}
                  </ui-button>
                </div>
              </div>
            }
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
  /** The flag whose extra confirm step is open; only one at a time. */
  protected readonly confirming = signal<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

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

  protected pressToggle(flag: FeatureFlag): void {
    if (this.confirming() === flag.key) {
      this.confirming.set(null);
      return;
    }
    if (!flag.blastRadius) {
      this.confirming.set(null);
      this.store.toggle(flag.key);
      return;
    }
    // Its write would be swallowed by the in-flight guard after the second step.
    if (this.isPending(flag.key)) return;
    this.confirming.set(flag.key);
    this.afterRender(() =>
      this.row(flag.key)?.querySelector<HTMLElement>('[data-testid="flag-confirm-cancel"] button')?.focus()
    );
  }

  protected cancelConfirm(key: string): void {
    this.confirming.set(null);
    this.focusToggle(key);
  }

  protected commitConfirm(key: string): void {
    this.confirming.set(null);
    this.store.toggle(key);
    this.focusToggle(key);
  }

  /**
   * Undo leaves with the offer, and focus would fall to <body> with it. The
   * row's toggle is where the operator was before they reached up to undo.
   */
  protected undo(): void {
    const key = this.store.lastToggle()?.key;
    if (!key) return;
    this.store.undoLastToggle();
    this.focusToggle(key);
  }

  private focusToggle(key: string): void {
    this.afterRender(() =>
      this.row(key)?.querySelector<HTMLElement>('[data-testid="flag-toggle"] button')?.focus()
    );
  }

  /** After the render, so the target's state, and the Undo it replaces, are current. */
  private afterRender(read: () => void): void {
    afterNextRender({ read }, { injector: this.injector });
  }

  private row(key: string): HTMLElement | undefined {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-testid="flag-row"]')
    ).find((row) => row.dataset['flagKey'] === key);
  }
}
