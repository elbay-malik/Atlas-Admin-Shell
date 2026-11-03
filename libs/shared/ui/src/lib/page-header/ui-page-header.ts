import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The header row of a domain screen, in one place because three remotes kept
 * their own copies and drifted: the first thing under the header started at
 * y=244 on /iam, 200 on /flags and 164 on /audit, which is the one visual
 * promise federation has to keep between neighbouring modules.
 *
 * Title block left, reports right. Two slots hold their height so the page does
 * not move, and each is arranged so the held space does not read as a hole:
 *
 * - The note line belongs to the title block. Holding it at the desk, even with
 *   nothing to say, is what puts the content at the same height on every screen.
 * - The action status sits under the badges, beside the title block, where the
 *   height is already paid for. Stacked on a phone it has no such neighbour, so
 *   it overlaps the header's bottom margin instead of adding to it.
 *
 * The second column's width comes from its basis rather than its content, so a
 * message arriving cannot push it onto a new line and move the page after all.
 */
@Component({
  selector: 'ui-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="min-w-0 flex-[1_1_20rem]">
        <h1 class="mb-1 text-2xl font-semibold">{{ heading() }}</h1>
        <div class="text-text-muted"><ng-content /></div>
        <div class="mt-1 text-sm text-text-muted md:min-h-5" data-testid="page-note">
          <ng-content select="[uiPageNote]" />
        </div>
      </div>
      <div
        class="flex min-w-0 flex-[1_1_20rem] flex-col items-start gap-1 md:flex-[0_1_20rem] md:items-end"
      >
        <div class="flex flex-wrap items-center gap-2 md:justify-end">
          <ng-content select="ui-badge" />
        </div>
        <div class="-mb-4 w-full empty:hidden"><ng-content select="ui-action-status" /></div>
      </div>
    </header>
  `,
})
export class UiPageHeader {
  readonly heading = input.required<string>();
}
