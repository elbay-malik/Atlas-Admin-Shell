import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiActionStatus } from '../action-status/ui-action-status';
import { UiBadge } from '../badge/ui-badge';
import { UiPageHeader } from './ui-page-header';

@Component({
  imports: [UiPageHeader, UiBadge, UiActionStatus],
  template: `
    <ui-page-header heading="Feature Flags">
      <p data-testid="lead">What this screen is for.</p>
      <p uiPageNote data-testid="note">Something worth knowing.</p>
      <ui-badge data-testid="badge">3 of 5 enabled</ui-badge>
      <ui-action-status />
    </ui-page-header>
  `,
})
class FullHeader {}

@Component({
  imports: [UiPageHeader],
  template: `<ui-page-header heading="Audit Logs"><p>Lead.</p></ui-page-header>`,
})
class BareHeader {}

function render<T>(component: new () => T): HTMLElement {
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('UiPageHeader', () => {
  it('puts each kind of content in its own slot, with one h1', () => {
    const el = render(FullHeader);
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toBe('Feature Flags');
    expect(el.querySelector('[data-testid="page-note"] [data-testid="note"]')).not.toBeNull();
    // The reports column: the badges first, then the status region under them.
    const badge = el.querySelector('[data-testid="badge"]') as HTMLElement;
    const status = el.querySelector('[data-testid="action-status"]') as HTMLElement;
    expect(badge.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('holds the note line with nothing to say, and collapses a status slot with no status', () => {
    const el = render(BareHeader);
    expect(el.querySelector('[data-testid="page-note"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="action-status"]')).toBeNull();
    expect(el.querySelector('.empty\\:hidden')?.childElementCount).toBe(0);
  });
});
