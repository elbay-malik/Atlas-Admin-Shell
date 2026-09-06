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
  const button = row.querySelector<HTMLButtonElement>('[data-testid="flag-toggle"]');
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
    expect(toggleIn(second).getAttribute('data-pending')).toBe('true');
    // busy, NOT disabled: disabling the control the user just activated would
    // throw keyboard focus to <body> and lose their place in the list
    expect(toggleIn(second).getAttribute('aria-busy')).toBe('true');
    expect(toggleIn(second).disabled).toBe(false);
    expect(toggleIn(first).getAttribute('aria-busy')).toBe('false');

    await vi.advanceTimersByTimeAsync(SET_ENABLED_MS);
    await TestBed.tick();

    expect(toggleIn(second).getAttribute('aria-pressed')).toBe('true');
    expect(toggleIn(second).getAttribute('data-pending')).toBe('false');
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
});
