import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AtlasAuth, MockAtlasAuth } from '@atlas/shared-auth';
import { provideAtlasEventBus } from '@atlas/shared-event-bus';
import { FlagsApi, FlagsMockApi } from '../data/flags-api';
import { FlagsStore } from '../data/flags.store';
import { FlagsHome } from './flags-home';

const GET_FLAGS_MS = 300;
const SET_ENABLED_MS = 200;

function query<T extends Element>(fixture: ComponentFixture<FlagsHome>, selector: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

function rows(fixture: ComponentFixture<FlagsHome>): HTMLLIElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLIElement>(
      '[data-testid="flag-row"]'
    )
  );
}

function toggleIn(row: HTMLLIElement): HTMLButtonElement {
  const button = row.querySelector<HTMLButtonElement>('[data-testid="flag-toggle"] button');
  if (!button) throw new Error('flag row is missing its toggle');
  return button;
}

describe('FlagsHome', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [FlagsHome],
      providers: [
        provideRouter([]),
        provideAtlasEventBus(),
        { provide: AtlasAuth, useClass: MockAtlasAuth },
        { provide: FlagsApi, useClass: FlagsMockApi },
        FlagsStore,
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  /**
   * Renders the screen as a persona and settles the store's initial load.
   * Flag writes are admin-only (ADR-0011), so the persona is now load-bearing
   * rather than incidental.
   */
  async function render(persona: 'admin' | 'viewer' = 'admin'): Promise<ComponentFixture<FlagsHome>> {
    await (TestBed.inject(AtlasAuth) as MockAtlasAuth).login(persona);
    const fixture = TestBed.createComponent(FlagsHome);
    await TestBed.tick();
    expect(query(fixture, '[data-testid="flags-loading"]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
    await TestBed.tick();
    return fixture;
  }

  it('renders a row per flag with its key, description and toggle state', async () => {
    const fixture = await render();

    expect(query(fixture, '[data-testid="flags-loading"]')).toBeNull();
    expect(query(fixture, '[data-testid="flags-error"]')).toBeNull();

    const rendered = rows(fixture);
    expect(rendered.map((row) => row.getAttribute('data-flag-key'))).toEqual([
      'new-dashboard',
      'bulk-export',
      'sso-enforced',
    ]);
    expect(rendered[0].querySelector('code')?.textContent?.trim()).toBe('new-dashboard');
    expect(rendered[0].textContent).toContain('Next-gen dashboard layout');
    expect(toggleIn(rendered[0]).getAttribute('aria-pressed')).toBe('true');
    expect(toggleIn(rendered[1]).getAttribute('aria-pressed')).toBe('false');
    expect(toggleIn(rendered[1]).getAttribute('aria-label')).toContain('bulk-export');
    expect(query(fixture, '[data-testid="flags-summary"]')?.textContent).toContain('1 of 3 enabled');
  });

  it('flips aria-pressed on click and marks only that row busy while it is pending', async () => {
    const fixture = await render();
    const [first, second] = rows(fixture);

    toggleIn(second).click();
    await TestBed.tick();

    expect(toggleIn(second).getAttribute('aria-pressed')).toBe('true');
    expect(toggleIn(second).textContent?.trim()).toBe('On');
    expect(toggleIn(second).parentElement?.getAttribute('data-pending')).toBe('true');
    // busy, NOT disabled: disabling the control the user just activated would
    // throw keyboard focus to <body> and lose their place in the list
    expect(toggleIn(second).getAttribute('aria-busy')).toBe('true');
    expect(toggleIn(second).disabled).toBe(false);
    expect(toggleIn(first).getAttribute('aria-busy')).toBe('false');

    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
    await TestBed.tick();

    expect(toggleIn(second).getAttribute('aria-pressed')).toBe('true');
    expect(toggleIn(second).parentElement?.getAttribute('data-pending')).toBe('false');
    expect(toggleIn(second).getAttribute('aria-busy')).toBe('false');
    expect(query(fixture, '[data-testid="flags-summary"]')?.textContent).toContain('2 of 3 enabled');
  });

  it('keeps the busy control focusable and swallows a double activation', async () => {
    const fixture = await render();
    const [, second] = rows(fixture);

    toggleIn(second).focus();
    toggleIn(second).click();
    await TestBed.tick();

    // the whole point of aria-busy over disabled: focus stays put
    expect(document.activeElement).toBe(toggleIn(second));

    // an impatient second click must not queue a second write and flip it back
    toggleIn(second).click();
    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
    await TestBed.tick();

    expect(toggleIn(second).getAttribute('aria-pressed')).toBe('true');
    expect(query(fixture, '[data-testid="flags-summary"]')?.textContent).toContain('2 of 3 enabled');
  });

  it('hides the toggle affordance from a viewer, who may not write flags', async () => {
    const fixture = await render('viewer');

    const [first] = rows(fixture);
    expect(toggleIn(first).disabled).toBe(true);
    expect(query(fixture, '[data-testid="flags-readonly"]')).not.toBeNull();
  });

  it('shows the error state with a Retry that reloads', async () => {
    (TestBed.inject(FlagsApi) as FlagsMockApi).failNext();

    const fixture = TestBed.createComponent(FlagsHome);
    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
    await TestBed.tick();

    const error = query<HTMLElement>(fixture, '[data-testid="flags-error"]');
    expect(error?.textContent).toContain('Could not load feature flags');
    expect(rows(fixture)).toHaveLength(0);

    error?.querySelector<HTMLButtonElement>('ui-button button')?.click();
    await vi.advanceTimersByTimeAsync(GET_FLAGS_MS);
    await TestBed.tick();

    expect(query(fixture, '[data-testid="flags-error"]')).toBeNull();
    expect(rows(fixture)).toHaveLength(3);
  });

  describe('the extra step on a blast-radius flag', () => {
    const inRow = <T extends Element>(row: Element, testId: string, inner = ''): T | null =>
      row.querySelector<T>(`[data-testid="${testId}"] ${inner}`.trim());

    async function open(): Promise<{ fixture: ComponentFixture<FlagsHome>; row: HTMLLIElement }> {
      const fixture = await render();
      const row = rows(fixture)[2];
      document.body.appendChild(fixture.nativeElement);
      toggleIn(row).click();
      await TestBed.tick();
      return { fixture, row };
    }

    it('asks first when the data marks the flag, and changes nothing yet', async () => {
      const { row } = await open();

      expect(inRow(row, 'flag-confirm')?.textContent).toContain('Turn on sso-enforced?');
      expect(inRow(row, 'flag-confirm')?.textContent).toContain('every tenant');
      expect(toggleIn(row).getAttribute('aria-pressed')).toBe('false');
      expect(toggleIn(row).getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(
        inRow(row, 'flag-confirm-cancel', 'button')
      );
    });

    it('does not ask for a flag the data does not mark', async () => {
      const fixture = await render();
      const row = rows(fixture)[1];

      toggleIn(row).click();
      await TestBed.tick();

      expect(inRow(row, 'flag-confirm')).toBeNull();
      expect(toggleIn(row).getAttribute('aria-pressed')).toBe('true');
      expect(toggleIn(row).hasAttribute('aria-expanded')).toBe(false);
    });

    it('applies on the second step and returns focus to the toggle', async () => {
      const { fixture, row } = await open();

      inRow<HTMLButtonElement>(row, 'flag-confirm-commit', 'button')?.click();
      await TestBed.tick();
      expect(toggleIn(row).getAttribute('aria-pressed')).toBe('true');
      expect(inRow(row, 'flag-confirm')).toBeNull();
      expect(document.activeElement).toBe(toggleIn(row));

      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      await TestBed.tick();
      expect(query(fixture, '[data-testid="action-status"]')?.textContent).toContain(
        'sso-enforced turned on.'
      );
    });

    it('backs out on Keep, on Escape and on the toggle, with focus back on the toggle', async () => {
      const { row } = await open();

      inRow<HTMLButtonElement>(row, 'flag-confirm-cancel', 'button')?.click();
      await TestBed.tick();
      expect(inRow(row, 'flag-confirm')).toBeNull();
      expect(document.activeElement).toBe(toggleIn(row));

      toggleIn(row).click();
      await TestBed.tick();
      inRow(row, 'flag-confirm')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await TestBed.tick();
      expect(inRow(row, 'flag-confirm')).toBeNull();
      expect(document.activeElement).toBe(toggleIn(row));

      toggleIn(row).click();
      await TestBed.tick();
      toggleIn(row).click();
      await TestBed.tick();
      expect(inRow(row, 'flag-confirm')).toBeNull();
      expect(toggleIn(row).getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('Undo', () => {
    it('returns focus to the row, and stops being offered', async () => {
      const fixture = await render();
      document.body.appendChild(fixture.nativeElement);
      const row = rows(fixture)[1];

      toggleIn(row).click();
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      await TestBed.tick();

      const status = query<HTMLElement>(fixture, '[data-testid="action-status"]');
      const undo = status?.querySelector<HTMLButtonElement>('button');
      undo?.focus();
      undo?.click();
      await TestBed.tick();

      expect(document.activeElement).toBe(toggleIn(row));
      expect(query(fixture, '[data-testid="action-status-undo-slot"]')).not.toBeNull();

      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      await TestBed.tick();
      expect(status?.textContent).toContain('Undone: bulk-export turned on.');
      expect(status?.querySelector('button')).toBeNull();
    });

    it('clears the line when it expires', async () => {
      const fixture = await render();
      toggleIn(rows(fixture)[1]).click();
      await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
      await TestBed.tick();

      await vi.advanceTimersByTimeAsync(60_000);
      await TestBed.tick();

      expect(query(fixture, '[data-testid="action-status"]')?.textContent?.trim()).toBe('');
    });
  });

  it('tells a viewer why, in text the toggles point at', async () => {
    const fixture = await render('viewer');

    const reason = query<HTMLElement>(fixture, '[data-testid="flags-readonly-reason"]');
    expect(reason?.textContent).toContain('Only admins can change feature flags');
    const toggle = toggleIn(rows(fixture)[0]);
    expect(toggle.getAttribute('aria-describedby')).toBe(reason?.id);
    expect(toggle.hasAttribute('title')).toBe(false);
  });

  it('shows no such reason to an admin', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-testid="flags-readonly-reason"]')).toBeNull();
  });

  it('offers an admin the toggles in its intro line', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-testid="flags-intro"]')?.textContent?.trim()).toBe(
      'Toggle features for this deployment.'
    );
  });

  it('does not offer a viewer toggles they cannot use', async () => {
    const fixture = await render('viewer');
    expect(query(fixture, '[data-testid="flags-intro"]')?.textContent?.trim()).toBe(
      'See which features are on for this deployment.'
    );
  });
});
