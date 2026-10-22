import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiIcon } from './ui-icon';

@Component({
  imports: [UiIcon],
  template: `<ui-icon [name]="name" />`,
})
class Host {
  name = 'users';
}

function render(name: string): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.name = name;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('UiIcon', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [Host] }));

  it('draws a known name as an inline svg', () => {
    const svg = render('users').querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('takes its colour from the text around it, so it cannot introduce a hue', () => {
    // The whole reason these replaced emoji: DESIGN.md rations colour to state,
    // and a full-colour glyph spent it on identity. currentColor is what makes
    // an icon muted in a resting nav item and on-brand in the active one.
    const svg = render('flag').querySelector('svg');

    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('fill')).toBe('none');
  });

  it('uses one stroke weight across the whole set', () => {
    // Four emoji at four visual weights is what this replaced; a set that
    // drifted in weight would be the same failure in a different costume.
    for (const name of ['overview', 'users', 'flag', 'ledger', 'compass', 'sun', 'moon']) {
      const svg = render(name).querySelector('svg');
      expect(svg, `${name} must render`).not.toBeNull();
      expect(svg?.getAttribute('stroke-width'), `${name} stroke weight`).toBe('1.5');
    }
  });

  it('renders an unknown name verbatim rather than leaving a hole', () => {
    /*
     * The manifest is a deployment artifact that ships independently of this
     * bundle (ADR-0010), so a manifest written before this set existed still
     * carries an emoji. It has to keep rendering: a deploy that silently
     * emptied every nav icon would be a worse outcome than an inconsistent one.
     */
    const host = render('🚩');

    expect(host.querySelector('svg')).toBeNull();
    expect(host.textContent?.trim()).toBe('🚩');
  });

  it('hides itself from assistive tech, because the label carries the name', () => {
    const svg = render('ledger').querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });
});
