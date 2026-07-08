import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'ui-nav-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <a
      class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface hover:text-text aria-disabled:pointer-events-none aria-disabled:opacity-40"
      routerLinkActive="!bg-brand-primary/10 !text-brand-primary font-medium"
      [routerLink]="disabled() ? null : link()"
      [routerLinkActiveOptions]="{ exact: exact() }"
      [attr.aria-disabled]="disabled()"
    >
      @if (icon()) {
        <span aria-hidden="true" class="w-5 text-center">{{ icon() }}</span>
      }
      <span><ng-content /></span>
    </a>
  `,
})
export class UiNavItem {
  readonly link = input.required<string>();
  readonly icon = input<string>('');
  readonly exact = input(false);
  readonly disabled = input(false);
}
