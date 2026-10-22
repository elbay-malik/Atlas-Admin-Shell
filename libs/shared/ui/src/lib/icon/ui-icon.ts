import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The drawn icon set.
 *
 * It replaces the emoji the manifest used to supply (🧭 🚩 🧾 👥 and a
 * geometric ⌂). Those were the only expressive element in the console and the
 * weakest: four full-colour OS glyphs beside one thin outline, rendering
 * differently on every platform, at four different visual weights — in a system
 * whose entire thesis is restraint. Worse, they were the one place colour
 * arrived without carrying state, which breaks DESIGN.md's Rationed Colour Rule
 * in the most visible component in the product.
 *
 * Every path here is stroke-only at a single 1.5 width on a 20px grid, in
 * `currentColor`. That is what makes them obey the colour ration: an icon takes
 * the ink of whatever it sits in — muted in a resting nav item, `on-brand` in
 * the active one — and can never introduce a hue of its own.
 */
export type UiIconName =
  | 'overview'
  | 'users'
  | 'flag'
  | 'ledger'
  | 'compass'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'close'
  | 'lock';

const PATHS: Record<UiIconName, readonly string[]> = {
  // a roof over an open body: "the top level", not a house
  overview: ['M2.75 8.5 10 2.75l7.25 5.75', 'M4.5 7.9v8.35h11V7.9'],
  // two figures, the second behind and partial — "people", at a glance
  users: [
    'M7.5 9.75a2.875 2.875 0 1 0 0-5.75 2.875 2.875 0 0 0 0 5.75Z',
    'M2.5 16.75c0-2.625 2.239-4.75 5-4.75s5 2.125 5 4.75',
    'M13.25 4.6a2.625 2.625 0 0 1 0 5.05',
    'M15 12.4c1.625.65 2.5 2.2 2.5 4.35',
  ],
  // pole plus a pennant with a notch, so it reads as a flag and not a sign
  flag: ['M5.5 2.75v14.5', 'M5.5 4h8.75l-1.75 3.125L14.25 10.25H5.5z'],
  // a torn-off slip with entries on it: a record, not a document
  ledger: [
    'M5.25 2.75h9.5v14.5l-2.375-1.5L10 17.25l-2.375-1.5L5.25 17.25z',
    'M7.75 6.5h4.5',
    'M7.75 9.25h4.5',
    'M7.75 12h2.75',
  ],
  // marks a domain the current role may not open. A mark rather than a word:
  // a role badge on the nav item pushed the label onto a second line, and
  // truncating the label to fit was worse than either — a nav item nobody can
  // read is not a nav item.
  lock: ['M6 9V6.5a4 4 0 0 1 8 0V9', 'M4.75 9h10.5v8.25H4.75z'],
  // the drawer control, below md only
  menu: ['M3.25 6h13.5', 'M3.25 10h13.5', 'M3.25 14h13.5'],
  close: ['M5.25 5.25l9.5 9.5', 'M14.75 5.25l-9.5 9.5'],
  // the theme toggle's two states. They were ☀ and ☾ — the same "glyph instead
  // of an icon" substitution as the nav emoji, and the last of it in the
  // product.
  sun: [
    'M10 13.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z',
    'M10 2.75v1.5', 'M10 15.75v1.5', 'M2.75 10h1.5', 'M15.75 10h1.5',
    'M4.9 4.9l1.06 1.06', 'M14.04 14.04l1.06 1.06',
    'M4.9 15.1l1.06-1.06', 'M14.04 5.96l1.06-1.06',
  ],
  moon: ['M15.5 12.6A6.75 6.75 0 0 1 7.4 4.5a6.75 6.75 0 1 0 8.1 8.1Z'],
  // the wordmark: a bearing needle in its ring
  compass: [
    'M10 17.25a7.25 7.25 0 1 0 0-14.5 7.25 7.25 0 0 0 0 14.5Z',
    'M12.9 7.1l-1.45 4.35-4.35 1.45 1.45-4.35z',
  ],
};

@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (paths(); as paths) {
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        @for (d of paths; track d) {
          <path [attr.d]="d" />
        }
      </svg>
    } @else {
      <!--
        An unknown name renders verbatim. The manifest is a deployment artifact
        that ships independently of this bundle (ADR-0010), so a manifest
        written before this set existed still carries an emoji — it must keep
        rendering rather than leave a hole in the nav.
      -->
      <span aria-hidden="true">{{ name() }}</span>
    }
  `,
})
export class UiIcon {
  /** A name from the set, or any other string, which is rendered as-is. */
  readonly name = input.required<string>();
  /** Edge length in px. 20 is the nav size; the wordmark uses 22. */
  readonly size = input(20);

  protected readonly paths = computed(() => PATHS[this.name() as UiIconName] ?? null);
}
