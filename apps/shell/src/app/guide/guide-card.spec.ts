import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AtlasManifest } from '@atlas/shared-contracts';
import { DEMO_SESSION } from '../auth/demo-session';
import { ATLAS_MANIFEST } from '../manifest.token';
import { FirstVisitGuide, GUIDE_CLOSED_KEY, GUIDE_DISMISSED_KEY } from './first-visit-guide';
import { GuideCard } from './guide-card';

const manifest: AtlasManifest = {
  version: 1,
  auth: { kind: 'nhost', url: 'https://identity.test.invalid/v1', provider: 'github' },
  remotes: {
    iam: {
      url: 'http://localhost:4201/remoteEntry.json',
      displayName: 'Identity & Access',
      route: 'iam',
      icon: 'users',
      exposedModule: './Routes',
      requiredRole: 'admin',
    },
    'feature-flags': {
      url: 'http://localhost:4202/remoteEntry.json',
      displayName: 'Feature Flags',
      route: 'flags',
      icon: 'flag',
      exposedModule: './Routes',
      requiredRole: 'viewer',
    },
    'audit-logs': {
      url: 'http://localhost:4203/remoteEntry.json',
      displayName: 'Audit Logs',
      route: 'audit',
      icon: 'ledger',
      exposedModule: './Routes',
      requiredRole: 'viewer',
    },
  },
};

async function render(options: { demo?: boolean; manifest?: AtlasManifest } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ATLAS_MANIFEST, useValue: options.manifest ?? manifest },
      ...(options.demo === false ? [] : [{ provide: DEMO_SESSION, useValue: { active: () => false } }]),
    ],
  });
  const fixture = TestBed.createComponent(GuideCard);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    guide: TestBed.inject(FirstVisitGuide),
    card: () => el.querySelector<HTMLElement>('[data-testid="guide-card"]'),
    button: (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${id}"] button`) as HTMLButtonElement,
    steps: () => Array.from(el.querySelectorAll('[data-testid="guide-steps"] li')).map((li) => li.textContent?.trim()),
  };
}

describe('first-visit guide', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('shows on a first visit, without taking focus', async () => {
    const { card } = await render();
    expect(card()).not.toBeNull();
    expect(card()?.getAttribute('aria-labelledby')).toBe('guide-title');
    expect(document.activeElement).toBe(document.body);
  });

  it('names what this deployment offers, and what a GitHub account cannot open', async () => {
    const { steps } = await render();
    expect(steps()).toEqual([
      'Press Explore with demo data to look around as an admin on mock data, with no account. ' +
        "GitHub sign-in works too, but a new account is a viewer and can't open Identity & Access. " +
        'Sign-in may be slow while the free Nhost project wakes up.',
      'Open Identity & Access, Feature Flags and Audit Logs. Each is a separate app, deployed on its own and ' +
        'loaded by this shell when you first open it.',
      'Change a role in Identity & Access, then open Audit Logs. The change arrives there as an event from the ' +
        'other app.',
    ]);
  });

  it('offers the mock personas when there is no demo and no provider', async () => {
    const { steps } = await render({ demo: false, manifest: { ...manifest, auth: undefined } });
    expect(steps()[0]).toBe("Sign in as admin from the header: a viewer can't open Identity & Access.");
  });

  it('leaves out the cross-app step when the deployment lacks either app', async () => {
    const { 'audit-logs': _audit, ...rest } = manifest.remotes;
    const { steps } = await render({ manifest: { ...manifest, remotes: rest } });
    expect(steps()).toHaveLength(2);
    expect(steps()[1]).toContain('Open Identity & Access and Feature Flags.');
  });

  it('Close hides it for this tab only', async () => {
    const { fixture, card, button } = await render();
    button('guide-close').click();
    await fixture.whenStable();

    expect(card()).toBeNull();
    expect(sessionStorage.getItem(GUIDE_CLOSED_KEY)).toBe('closed');
    expect(localStorage.getItem(GUIDE_DISMISSED_KEY)).toBeNull();
  });

  it("Don't show again is remembered across visits", async () => {
    const { fixture, card, button } = await render();
    button('guide-dismiss').click();
    await fixture.whenStable();

    expect(card()).toBeNull();
    expect(localStorage.getItem(GUIDE_DISMISSED_KEY)).toBe('dismissed');
    sessionStorage.clear(); // a new tab
    expect(new FirstVisitGuide().open()).toBe(false);
  });

  it('starts closed after either choice', () => {
    sessionStorage.setItem(GUIDE_CLOSED_KEY, 'closed');
    expect(new FirstVisitGuide().open()).toBe(false);
    sessionStorage.clear();
    localStorage.setItem(GUIDE_DISMISSED_KEY, 'dismissed');
    expect(new FirstVisitGuide().open()).toBe(false);
  });

  it('reopens on request, and keeps "Don\'t show again" for the next visit', async () => {
    localStorage.setItem(GUIDE_DISMISSED_KEY, 'dismissed');
    const { fixture, guide, card } = await render();
    expect(card()).toBeNull();

    guide.reopen();
    await fixture.whenStable();

    expect(card()).not.toBeNull();
    expect(localStorage.getItem(GUIDE_DISMISSED_KEY)).toBe('dismissed');
  });

  it('closes on Escape from inside it and hands focus to the page', async () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
    const { fixture, card, button } = await render();

    button('guide-close').focus();
    button('guide-close').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(card()).toBeNull();
    expect(document.activeElement).toBe(main);
  });

  it('ignores an Escape meant for something else', async () => {
    const { fixture, card } = await render();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(card()).not.toBeNull();
  });

  it('starts as a one-line bar on a phone and expands on request', async () => {
    // jsdom has no matchMedia; a narrow screen is one that answers false.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    const { fixture, card, button, steps } = await render();

    expect(card()?.dataset['expanded']).toBe('false');
    expect(steps()).toEqual([]);

    button('guide-expand').click();
    await fixture.whenStable();

    expect(card()?.dataset['expanded']).toBe('true');
    expect(steps()).toHaveLength(3);
    expect(document.activeElement).toBe(card());
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { fixture, card, button } = await render();
    expect(card()).not.toBeNull();

    button('guide-dismiss').click();
    await fixture.whenStable();
    expect(card()).toBeNull();
  });
});
