import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiBadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      [class]="toneClass()"
    >
      <ng-content />
    </span>
  `,
})
export class UiBadge {
  readonly tone = input<UiBadgeTone>('neutral');

  protected toneClass(): string {
    switch (this.tone()) {
      case 'success':
        return 'bg-status-success/15 text-status-success';
      case 'warning':
        return 'bg-status-warning/15 text-status-warning';
      case 'danger':
        return 'bg-status-danger/15 text-status-danger';
      default:
        return 'bg-text/10 text-text-muted';
    }
  }
}
