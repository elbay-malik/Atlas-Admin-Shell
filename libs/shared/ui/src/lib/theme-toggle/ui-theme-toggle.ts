import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UiIcon } from '../icon/ui-icon';
import { ThemeService } from '../theme/theme.service';

@Component({
  selector: 'ui-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  template: `
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong transition-colors hover:bg-surface"
      [attr.aria-label]="theme.dark() ? 'Switch to light theme' : 'Switch to dark theme'"
      [attr.aria-pressed]="theme.dark()"
      (click)="theme.toggle()"
    >
      <!-- shows the state you are IN, matching aria-pressed, not the state you
           would move to; the label carries the destination -->
      <ui-icon [name]="theme.dark() ? 'moon' : 'sun'" />
    </button>
  `,
})
export class UiThemeToggle {
  protected readonly theme = inject(ThemeService);
}
