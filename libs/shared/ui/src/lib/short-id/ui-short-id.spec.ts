import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { shortenId, UiShortId } from './ui-short-id';

const VALUE = '3f6c2a10-7d4e-4b8a-9c21-5e0f7a2c91c6';

@Component({
  imports: [UiShortId],
  template: `<ui-short-id [value]="value" label="account ID" /><button id="next">next</button>`,
})
class Host {
  value = VALUE;
}

describe('shortenId', () => {
  it('keeps the two ends of a long id', () => {
    expect(shortenId(VALUE)).toBe('3f6c…91c6');
  });

  it('leaves a short one whole, since shortening would not save anything', () => {
    expect(shortenId('u-admin')).toBe('u-admin');
    expect(shortenId('')).toBe('');
  });
});

describe('UiShortId', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      el,
      button: el.querySelector('[data-testid="short-id"]') as HTMLButtonElement,
      value: () => el.querySelector('[data-testid="short-id-value"]'),
    };
  }

  afterEach(() => (document.body.innerHTML = ''));

  it('shows the short form and hides the full value until asked', async () => {
    const { button, value } = await render();

    expect(button.textContent).toContain('3f6c…91c6');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(value()).toBeNull();
  });

  it('says what it is to a screen reader', async () => {
    const { button } = await render();

    expect(button.textContent).toContain('show the full account ID');
  });

  it('opens on press, which a keyboard can do', async () => {
    const { fixture, button, value } = await render();

    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(value()?.textContent).toContain(VALUE);
  });

  it('closes on Escape', async () => {
    const { fixture, button, value } = await render();
    button.click();
    await fixture.whenStable();

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(value()).toBeNull();
  });

  it('closes when focus leaves it', async () => {
    const { fixture, el, button, value } = await render();
    button.focus();
    button.click();
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('#next')?.focus();
    await fixture.whenStable();

    expect(value()).toBeNull();
  });
});
