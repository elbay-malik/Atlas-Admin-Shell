import type { Page } from '@playwright/test';

/** WCAG 1.4.11 minimum for the visual boundary that identifies a control. */
export const MIN_NON_TEXT_RATIO = 3;

function relativeLuminance([r, g, b]: number[]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: number[], b: number[]): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export interface MeasuredControl {
  label: string;
  border: number[];
  borderWidth: number;
  background: number[];
}

export const CONTROL_SELECTOR = 'button, select, input:not([type="hidden"]), a[href]';

/**
 * Reads each control's border colour together with the background actually
 * painted behind it, walking up past transparent ancestors the way the eye does.
 */
export function measureControls(page: Page): Promise<MeasuredControl[]> {
  return page.locator(CONTROL_SELECTOR).evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

      let behind: Element | null = element.parentElement;
      let background = 'rgba(0, 0, 0, 0)';
      while (behind) {
        const value = getComputedStyle(behind).backgroundColor;
        if (value && !value.startsWith('rgba(0, 0, 0, 0')) {
          background = value;
          break;
        }
        behind = behind.parentElement;
      }

      return {
        label: element.getAttribute('data-testid') ?? element.tagName.toLowerCase(),
        border: parse(style.borderTopColor),
        borderWidth: parseFloat(style.borderTopWidth),
        background: parse(background),
      };
    })
  );
}

/** Controls whose boundary falls below the minimum, formatted for an assertion. */
export function failingBoundaries(measured: MeasuredControl[]): string[] {
  return measured
    .filter((c) => c.borderWidth > 0 && c.border.length === 3)
    .map((c) => ({ ...c, ratio: contrastRatio(c.border, c.background) }))
    .filter((c) => c.ratio < MIN_NON_TEXT_RATIO)
    .map((c) => `${c.label}: ${c.ratio.toFixed(2)}:1 (needs ${MIN_NON_TEXT_RATIO}:1)`);
}

/** How many controls actually carried a measurable border, so a silent no-op fails. */
export function outlinedCount(measured: MeasuredControl[]): number {
  return measured.filter((c) => c.borderWidth > 0 && c.border.length === 3).length;
}

/**
 * WCAG 2.4.13 Focus Appearance is AAA and not binding here, but its 2px minimum
 * is the thickness the shared treatment actually ships, and a ring that thinned
 * to 1px would be the user agent default creeping back in.
 */
export const MIN_FOCUS_RING_WIDTH = 2;

export interface MeasuredFocusRing {
  label: string;
  outline: number[];
  outlineWidth: number;
  outlineStyle: string;
  /** The colour painted where the ring is drawn, which the offset exposes. */
  backdrop: number[];
  /**
   * Whether the browser considers this a keyboard focus. Measured, not assumed:
   * a control can hold focus without matching `:focus-visible`, and then the
   * authored rule does not apply and `outline-color` falls back to
   * `currentColor` — which on a white-text button reads as a white ring.
   */
  focusVisible: boolean;
}

/**
 * Walks the real tab order and measures the focus ring on each stop.
 *
 * Tab rather than `locator.focus()` on purpose. Not because a programmatic
 * focus fails to match `:focus-visible` — in this repo's Playwright it does
 * match — but because that behaviour is an engine heuristic we would then be
 * depending on, and because the tab order is itself part of what must stay
 * correct: a control dropped out of it would otherwise still be measured.
 */
export async function tabThroughFocusRings(
  page: Page,
  stops: number
): Promise<MeasuredFocusRing[]> {
  const measured: MeasuredFocusRing[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) {
        return null;
      }
      const style = getComputedStyle(element);
      const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

      // The ring is drawn outside the border box, so the colour beside it is
      // the nearest ANCESTOR that actually paints — never the control's own
      // fill. That is the adjacency WCAG 1.4.11 cares about here.
      let behind: Element | null = element.parentElement;
      let backdrop = 'rgba(0, 0, 0, 0)';
      while (behind) {
        const value = getComputedStyle(behind).backgroundColor;
        if (value && !value.startsWith('rgba(0, 0, 0, 0')) {
          backdrop = value;
          break;
        }
        behind = behind.parentElement;
      }

      return {
        label:
          element.getAttribute('data-testid') ??
          element.getAttribute('aria-label') ??
          `${element.tagName.toLowerCase()}:${(element.textContent ?? '').trim().slice(0, 24)}`,
        outline: parse(style.outlineColor),
        outlineWidth: parseFloat(style.outlineWidth),
        outlineStyle: style.outlineStyle,
        backdrop: parse(backdrop),
        focusVisible: element.matches(':focus-visible'),
      };
    });

    if (!ring) continue;
    // Tab wraps round to the browser chrome and back; stop at the first repeat
    // rather than measuring the same control twice.
    if (seen.has(ring.label)) break;
    seen.add(ring.label);
    measured.push(ring);
  }

  return measured;
}

/**
 * Focus rings that would leave a keyboard user unable to tell where they are.
 *
 * `outline-style: auto` is the tell that nothing authored a ring: it is the
 * user agent's own indicator, 1px, in a colour no design system chose. Treating
 * it as a pass is how this gate would quietly stop testing anything.
 */
export function failingFocusRings(measured: MeasuredFocusRing[]): string[] {
  return measured
    .map((ring) => {
      if (!ring.focusVisible) {
        return `${ring.label}: holds focus but does not match :focus-visible, so no authored ring applies`;
      }
      if (ring.outlineStyle === 'none' || ring.outlineWidth === 0) {
        return `${ring.label}: no focus ring at all (outline-style: ${ring.outlineStyle})`;
      }
      if (ring.outlineStyle === 'auto') {
        return `${ring.label}: user agent default ring, not an authored one (outline-style: auto)`;
      }
      if (ring.outlineWidth < MIN_FOCUS_RING_WIDTH) {
        return `${ring.label}: ring is ${ring.outlineWidth}px (needs ${MIN_FOCUS_RING_WIDTH}px)`;
      }
      if (ring.outline.length !== 3 || ring.backdrop.length !== 3) {
        return `${ring.label}: ring or backdrop colour could not be measured`;
      }
      const ratio = contrastRatio(ring.outline, ring.backdrop);
      // Name both colours: a ratio alone cannot distinguish "the ring is the
      // wrong colour" from "the backdrop is not what we assumed", and those
      // have completely different fixes.
      return ratio < MIN_NON_TEXT_RATIO
        ? `${ring.label}: ring rgb(${ring.outline}) measures ${ratio.toFixed(2)}:1 against ` +
            `backdrop rgb(${ring.backdrop}) (needs ${MIN_NON_TEXT_RATIO}:1)`
        : null;
    })
    .filter((failure): failure is string => failure !== null);
}

/** Every stop, for diagnosing a failure without another round trip. */
export function describeFocusRings(measured: MeasuredFocusRing[]): string {
  return measured
    .map(
      (r) =>
        `  ${r.label} :focus-visible=${r.focusVisible} ` +
        `outline=${r.outlineWidth}px ${r.outlineStyle} rgb(${r.outline}) ` +
        `backdrop=rgb(${r.backdrop})`
    )
    .join('\n');
}
