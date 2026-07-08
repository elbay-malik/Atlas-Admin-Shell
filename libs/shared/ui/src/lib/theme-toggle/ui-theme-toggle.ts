import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../theme/theme.service';

@Component({
  selector: 'ui-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-lg hover:bg-surface"
      [attr.aria-label]="theme.dark() ? 'Switch to light theme' : 'Switch to dark theme'"
      [attr.aria-pressed]="theme.dark()"
      (click)="theme.toggle()"
    >
      {{ theme.dark() ? '☾' : '☀' }}
    </button>
  `,
})
export class UiThemeToggle {
  protected readonly theme = inject(ThemeService);
}
