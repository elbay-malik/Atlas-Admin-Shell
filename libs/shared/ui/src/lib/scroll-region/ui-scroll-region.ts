import { DOCUMENT, DestroyRef, Directive, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';

/**
 * A box that scrolls sideways inside itself, reachable without a pointer.
 *
 * A keyboard user can only pan a scroll container that can take focus, which is
 * what axe's scrollable-region-focusable reports (WCAG 2.1.1). A permanent
 * tabindex would answer that with a stop that does nothing whenever the content
 * fits, which is most of the time at a desk. So the stop, its role and its name
 * exist only while there is really something to pan, re-measured as the box and
 * its content change size: rows arrive after the first render.
 *
 * The value is what the region holds, because focus lands on the box itself and
 * something has to be read out when it does.
 */
@Directive({
  selector: '[uiScrollRegion]',
  host: {
    class: 'overflow-x-auto',
    '[attr.tabindex]': 'overflowing() ? 0 : null',
    '[attr.role]': 'overflowing() ? "region" : null',
    '[attr.aria-label]': 'overflowing() ? label() : null',
    '[attr.data-overflowing]': 'overflowing()',
  },
})
export class UiScrollRegion {
  readonly label = input.required<string>({ alias: 'uiScrollRegion' });

  protected readonly overflowing = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly window = inject(DOCUMENT).defaultView;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender({
      read: () => {
        const box = this.host.nativeElement;
        const measure = () => this.overflowing.set(box.scrollWidth > box.clientWidth);
        measure();
        const Observer = this.window?.ResizeObserver;
        if (!Observer) return;
        const observer = new Observer(measure);
        observer.observe(box);
        // The table is what grows when rows arrive; the box keeps its width.
        for (const child of Array.from(box.children)) observer.observe(child);
        destroyRef.onDestroy(() => observer.disconnect());
      },
    });
  }
}
