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
