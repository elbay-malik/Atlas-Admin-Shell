import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UiButton } from '../button/ui-button';

/**
 * What happened, said out loud, with a way back.
 *
 * Before this existed, the two destructive actions in the product — toggling a
 * feature flag and deactivating a user — produced no confirmation, no toast and
 * no announcement of any kind. `[role=status]`, `[aria-live]` and `[role=alert]`
 * were all empty on every domain screen, before and after acting. A screen
 * reader user had no way to tell whether anything had happened; a sighted user
 * had a label flipping and a counter changing at the far corner of the screen.
 *
 * Undo rather than a confirmation dialog, deliberately. A confirm interrupts
 * every action to protect against the rare one, and an operator working through
 * a list learns to dismiss it without reading. Undo keeps the common path at one
 * click and makes the rare mistake cheap — and it is the same control a keyboard
 * user needs anyway.
 *
 * THE ELEMENT IS ALWAYS IN THE DOM. A live region that is inserted at the same
 * moment its text appears is frequently not announced at all: assistive tech
 * watches regions it already knows about. So the <p> renders unconditionally
 * and only its contents change — which is also why this is a component rather
 * than an @if in each screen, where that subtlety would be re-litigated three
 * times and lost at least once.
 *
 * `polite`, not `assertive`: the operator did this on purpose, so it may wait
 * for a pause rather than interrupt them mid-sentence.
 */
@Component({
  selector: 'ui-action-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton],
  template: `
    <p
      role="status"
      aria-live="polite"
      data-testid="action-status"
      class="flex min-h-9 flex-wrap items-center gap-3 text-sm text-text-muted"
    >
      @if (message(); as text) {
        <span>{{ text }}</span>
        @if (undoable()) {
          <ui-button variant="secondary" [ariaLabel]="'Undo: ' + text" (pressed)="undo.emit()">
            Undo
          </ui-button>
        }
      }
    </p>
  `,
})
export class UiActionStatus {
  /** Empty or null renders the region silent, not absent. */
  readonly message = input<string | null>(null);
  readonly undoable = input(true);
  readonly undo = output<void>();
}
