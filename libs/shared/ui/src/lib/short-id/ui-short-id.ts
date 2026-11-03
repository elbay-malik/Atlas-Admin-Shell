import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/** `3f6c…91c6`: enough to recognise and compare, short enough for a header. */
export function shortenId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * A long identifier in short form, with the full value one key press away.
 *
 * A button rather than a `title`: hover text is out of reach of a keyboard or a
 * touch screen, and the full value is what someone needs to quote this account
 * to an administrator. It opens on press, so nothing appears uninvited, and the
 * value stays selectable.
 *
 * The panel floats but stays flat, using the same border-and-surface treatment
 * as the skip link. DESIGN.md has no elevation vocabulary and this does not
 * invent one.
 */
@Component({
  selector: 'ui-short-id',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-block',
    '(keydown.escape)': 'close()',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      type="button"
      data-testid="short-id"
      class="inline-flex min-h-6 items-center rounded-sm font-mono text-xs underline decoration-dotted
             underline-offset-4 transition-colors hover:text-on-brand"
      [attr.aria-expanded]="open()"
      [attr.title]="value()"
      (click)="open.set(!open())"
    >
      {{ short() }}<span class="sr-only">, show the full {{ label() }}</span>
    </button>
    @if (open()) {
      <span
        data-testid="short-id-value"
        tabindex="-1"
        class="absolute top-full z-50 mt-1 w-max max-w-[calc(100vw-2rem)] rounded-md border
               border-border-strong bg-surface px-2 py-1 font-mono text-xs break-all text-text"
        [class.left-0]="align() === 'start'"
        [class.right-0]="align() === 'end'"
      >
        {{ value() }}
      </span>
    }
  `,
})
export class UiShortId {
  readonly value = input.required<string>();
  /** What the value is, for screen readers: "account ID". */
  readonly label = input('ID');
  /** Which edge the panel lines up with. Use `end` near the right of the screen. */
  readonly align = input<'start' | 'end'>('start');

  protected readonly short = computed(() => shortenId(this.value()));
  protected readonly open = signal(false);

  protected close(): void {
    this.open.set(false);
  }

  protected onFocusOut(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(event.relatedTarget as Node | null)) this.close();
  }
}
