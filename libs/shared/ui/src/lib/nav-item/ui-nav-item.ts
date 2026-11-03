import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { UiIcon } from '../icon/ui-icon';

@Component({
  selector: 'ui-nav-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, UiIcon],
  template: `
    <a
      class="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm md:min-h-0 text-text-muted transition-colors hover:bg-surface hover:text-text aria-disabled:pointer-events-none aria-disabled:opacity-40"
      routerLinkActive="!bg-brand-primary/10 !text-on-brand font-medium"
      #active="routerLinkActive"
      [routerLink]="disabled() ? null : link()"
      [routerLinkActiveOptions]="{ exact: exact() }"
      [attr.aria-disabled]="disabled()"
      [attr.aria-current]="active.isActive ? 'page' : null"
    >
      @if (icon()) {
        <ui-icon [name]="icon()" />
      }
      <!-- min-w-0 lets the label shrink instead of pushing a trailing badge
           onto its own line, which made that item taller than every other -->
      <span class="flex min-w-0 flex-1 items-center gap-2"><ng-content /></span>
    </a>
  `,
})
export class UiNavItem {
  /*
   * `aria-current="page"` rather than the active tint alone. The tint is the
   * only signal a sighted user needs, but it is colour, and colour does not
   * reach a screen reader — without this a non-visual user has no location
   * indication anywhere in the console (WCAG 1.3.1 / 4.1.2). It is bound to
   * RouterLinkActive's own `isActive` so it can never disagree with the styling.
   */
  readonly link = input.required<string>();
  /** A name from the shared icon set; any other string renders verbatim. */
  readonly icon = input<string>('');
  readonly exact = input(false);
  readonly disabled = input(false);
}
