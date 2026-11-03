import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { UiButton } from '../button/ui-button';

/** One acknowledgement. A new object restarts the clock, even with the same words. */
export interface UiActionStatusValue {
  message: string;
  /** False for an acknowledgement with nothing left to reverse, such as an undo. */
  undoable: boolean;
  /** The message of a change whose Undo this one has just replaced, if any. */
  supersedes: string | null;
}

/** Long enough to read the line, notice it is wrong and reach back for Undo. */
const UNDO_WINDOW_MS = 12_000;
/** Nothing to act on, so only the reading time matters. */
const ACKNOWLEDGEMENT_MS = 6_000;
/** About 1000 characters a minute, a comfortable pace for a line read once. */
const READING_MS_PER_CHARACTER = 60;
const TICK_MS = 250;

/** How long a status stays up, counting only the time it is not being held. */
export function actionStatusLifetime(status: UiActionStatusValue): number {
  const words = status.message.length + (status.supersedes?.length ?? 0);
  const base = status.undoable ? UNDO_WINDOW_MS : ACKNOWLEDGEMENT_MS;
  return base + words * READING_MS_PER_CHARACTER;
}

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
 * times and lost at least once. The Undo slot stays mounted for the same reason,
 * and only the button inside it comes and goes.
 *
 * It expires. An Undo offered indefinitely stops describing the current state,
 * so the line clears after a reading-time allowance. The clock does not run
 * while the pointer or keyboard focus is on the line, or while the tab is
 * hidden: nobody loses Undo while reaching for it, or by looking away.
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
      #region
      role="status"
      aria-live="polite"
      data-testid="action-status"
      class="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted"
    >
      @if (status(); as current) {
        <span>{{ current.message }}</span>
      }
      <span data-testid="action-status-undo-slot">
        @if (status(); as current) {
          @if (current.undoable) {
            <ui-button
              variant="secondary"
              [ariaLabel]="'Undo: ' + current.message"
              (pressed)="undo.emit()"
            >
              Undo
            </ui-button>
          }
        }
      </span>
      @if (supersededNote(); as note) {
        <span data-testid="action-status-superseded">{{ note }}</span>
      }
    </p>
  `,
})
export class UiActionStatus {
  /** Null renders the region silent, not absent. */
  readonly status = input<UiActionStatusValue | null>(null);
  readonly undo = output<void>();
  /** The status has run its time; the owner should clear it. */
  readonly expired = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly region = viewChild.required<ElementRef<HTMLElement>>('region');

  /** Says out loud that an earlier Undo has gone, and where the way back now is. */
  protected readonly supersededNote = computed(() => {
    const earlier = this.status()?.supersedes;
    if (!earlier) return null;
    return `"${earlier.replace(/\.$/, '')}" can no longer be undone here; reverse it in its row.`;
  });

  constructor() {
    effect((onCleanup) => {
      const status = this.status();
      if (!status) return;

      let remaining = actionStatusLifetime(status);
      const clock = setInterval(() => {
        if (this.isHeld()) return;
        remaining -= TICK_MS;
        if (remaining > 0) return;
        clearInterval(clock);
        this.expired.emit();
      }, TICK_MS);
      onCleanup(() => clearInterval(clock));
    });
  }

  /**
   * Read at each tick rather than tracked through events: a focused Undo that
   * gets removed does not reliably fire focusout, and a missed event here would
   * leave a line on screen for good.
   */
  private isHeld(): boolean {
    const region = this.region().nativeElement;
    const view = this.document.defaultView;
    // A touch screen keeps :hover on whatever was tapped last, until the next tap.
    const canHover = view?.matchMedia?.('(hover: hover)').matches ?? false;
    return (
      this.document.hidden ||
      region.contains(this.document.activeElement) ||
      (canHover && region.matches(':hover'))
    );
  }
}
