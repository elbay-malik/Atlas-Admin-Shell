import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-quiet';

@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    <button
      type="button"
      class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-1.5 md:min-h-0 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      [class]="variantClass()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-busy]="busy()"
      (click)="pressed.emit()"
    >
      <ng-content />
    </button>
  `,
})
export class UiButton {
  readonly variant = input<UiButtonVariant>('primary');
  readonly disabled = input(false);
  /**
   * Accessible name, for when the visible label repeats across rows (four
   * "Deactivate" buttons in a table are indistinguishable in a screen-reader
   * rotor). Keep the visible text as a prefix of this value — WCAG 2.5.3.
   */
  readonly ariaLabel = input<string>();
  /**
   * Work is in flight. Prefer this over `disabled` for an action the user just
   * triggered: disabling the focused control moves focus to <body>. The caller
   * is responsible for ignoring duplicate activations.
   */
  readonly busy = input(false);
  readonly pressed = output<void>();

  protected variantClass(): string {
    switch (this.variant()) {
      case 'secondary':
        // border-strong, not border: this outline is the control's only
        // affordance, so it must clear 3:1 (WCAG 1.4.11)
        return 'border border-border-strong bg-surface text-text hover:border-brand-primary';
      case 'danger':
        return 'bg-status-danger text-white hover:bg-status-danger-strong';
      case 'danger-quiet':
        // For a destructive action that repeats down a list. A row of solid red
        // would spend the colour ration and make a real fault harder to spot, so
        // the fill waits for hover. on-danger, not status-danger: Fault Red
        // itself falls short of 3:1 against the dark surface.
        return 'border border-on-danger bg-surface text-on-danger hover:border-status-danger hover:bg-status-danger hover:text-white';
      default:
        return 'bg-brand-primary text-white hover:bg-brand-primary-strong';
    }
  }
}
