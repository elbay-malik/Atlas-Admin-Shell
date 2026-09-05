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

  /**
   * Tinted background + an `on-*` ink token. The status hue itself is too light
   * on its own 15% tint to clear WCAG AA at this size (measured 3.65:1), so the
   * text uses the dedicated foreground token, which is dark in light mode and
   * light in dark mode. Enforced by the Storybook a11y gate.
   */
  protected toneClass(): string {
    switch (this.tone()) {
      case 'success':
        return 'bg-status-success/15 text-on-success';
      case 'warning':
        return 'bg-status-warning/15 text-on-warning';
      case 'danger':
        return 'bg-status-danger/15 text-on-danger';
      default:
        return 'bg-text/10 text-text-muted';
    }
  }
}
