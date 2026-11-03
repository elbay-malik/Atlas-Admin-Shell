import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiScrollRegion } from './ui-scroll-region';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiScrollRegion],
  template: `<div uiScrollRegion="Audit events"><table></table></div>`,
})
class Host {}

type ResizeCallback = () => void;

describe('UiScrollRegion', () => {
  let resize: ResizeCallback;
  const disconnect = vi.fn();

  beforeEach(() => {
    disconnect.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeCallback) {
          resize = callback;
        }
        observe(): void {
          // The test calls the callback itself.
        }
        disconnect(): void {
          disconnect();
        }
      }
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function setWidths(box: HTMLElement, scrollWidth: number, clientWidth: number): void {
    Object.defineProperty(box, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: clientWidth });
  }

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, box: fixture.nativeElement.querySelector('div') as HTMLElement };
  }

  it('is not a tab stop while everything fits', async () => {
    const { box } = await render();
    expect(box.hasAttribute('tabindex')).toBe(false);
    expect(box.hasAttribute('role')).toBe(false);
    expect(box.hasAttribute('aria-label')).toBe(false);
    expect(box.classList.contains('overflow-x-auto')).toBe(true);
  });

  it('becomes a named, focusable region once its content overflows, and stops when it fits', async () => {
    const { fixture, box } = await render();

    setWidths(box, 600, 342);
    resize();
    await fixture.whenStable();
    expect(box.getAttribute('tabindex')).toBe('0');
    expect(box.getAttribute('role')).toBe('region');
    expect(box.getAttribute('aria-label')).toBe('Audit events');

    setWidths(box, 342, 342);
    resize();
    await fixture.whenStable();
    expect(box.hasAttribute('tabindex')).toBe(false);
  });

  it('stops measuring when it is destroyed', async () => {
    const { fixture } = await render();
    fixture.destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
