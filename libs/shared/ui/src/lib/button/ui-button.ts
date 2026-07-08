import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'danger';

@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      [class]="variantClass()"
      [disabled]="disabled()"
      (click)="pressed.emit()"
    >
      <ng-content />
    </button>
  `,
})
export class UiButton {
  readonly variant = input<UiButtonVariant>('primary');
  readonly disabled = input(false);
  readonly pressed = output<void>();

  protected variantClass(): string {
    switch (this.variant()) {
      case 'secondary':
        return 'border border-border bg-surface text-text hover:border-brand-primary';
      case 'danger':
        return 'bg-status-danger text-white hover:opacity-90';
      default:
        return 'bg-brand-primary text-white hover:bg-brand-primary-strong';
    }
  }
}
