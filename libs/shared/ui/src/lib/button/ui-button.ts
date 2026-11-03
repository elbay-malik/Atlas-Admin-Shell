import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-quiet';

@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    <button
      type="button"
      class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-1.5 md:min-h-9 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      [class]="variantClass()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-busy]="busy()"
      [attr.aria-pressed]="toggled()"
      [attr.aria-expanded]="expanded()"
      [attr.aria-describedby]="describedBy()"
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
  /**
   * Makes this a toggle: true or false is its state, null an ordinary button.
   * On takes Control Indigo's fill whatever the variant, so it reads as on.
   */
  readonly toggled = input<boolean | null>(null);
  /** Whether this button has opened something next to it; null when it never does. */
  readonly expanded = input<boolean | null>(null);
  /** The id of text that explains this control, such as why it is disabled. */
  readonly describedBy = input<string | null>(null);
  readonly pressed = output<void>();

  protected variantClass(): string {
    switch (this.variant()) {
      case 'secondary':
        // border-strong, not border: this outline is the control's only
        // affordance, so it must clear 3:1 (WCAG 1.4.11)
        return 'border-border-strong bg-surface text-text hover:border-brand-primary aria-pressed:border-brand-primary aria-pressed:bg-brand-primary aria-pressed:text-white';
      case 'danger':
        return 'border-transparent bg-status-danger text-white hover:bg-status-danger-strong';
      case 'danger-quiet':
        // For a destructive action that repeats down a list. A row of solid red
        // would spend the colour ration and make a real fault harder to spot, so
        // the fill waits for hover. on-danger, not status-danger: Fault Red
        // itself falls short of 3:1 against the dark surface.
        return 'border-on-danger bg-surface text-on-danger hover:border-status-danger hover:bg-status-danger hover:text-white';
      default:
        // A transparent border, so a filled button is as tall as an outlined one.
        return 'border-transparent bg-brand-primary text-white hover:bg-brand-primary-strong';
    }
  }
}
