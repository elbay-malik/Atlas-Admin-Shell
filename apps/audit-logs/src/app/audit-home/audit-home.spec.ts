import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ATLAS_API_MODE, AtlasApiMode } from '@atlas/shared-util';
import { AuditEntry } from '../data/audit-entry';
import { AuditStore } from '../data/audit.store';
import { AuditHome } from './audit-home';

const entry = (id: string, actor: string): AuditEntry =>
  ({ id, actor, action: 'user.updated', target: 'u-1', at: '2026-01-01T00:00:00Z', source: 'seed' }) as AuditEntry;

function configure(apiMode: AtlasApiMode, entries: AuditEntry[] = []) {
  const query = signal('');
  const store = {
    entities: signal(entries),
    filtered: signal(entries),
    query,
    setQuery: (value: string) => query.set(value),
    error: signal<string | null>(null),
    isPending: signal(false),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'audit', component: AuditHome }]),
      { provide: ATLAS_API_MODE, useValue: apiMode },
      { provide: AuditStore, useValue: store },
    ],
  });
  return store;
}

async function render(apiMode: AtlasApiMode): Promise<HTMLElement> {
  configure(apiMode);
  const fixture = TestBed.createComponent(AuditHome);
  await fixture.whenStable();
  return fixture.nativeElement;
}

describe('AuditHome', () => {
  it('says the mock trail lives in this tab and clears on reload', async () => {
    const el = await render('mock');
    expect(el.querySelector('[data-testid="audit-in-memory"]')?.textContent).toContain(
      'lives in this tab and clears on reload'
    );
  });

  it('does not say so when an edge is keeping the trail', async () => {
    const el = await render('http');
    expect(el.querySelector('[data-testid="audit-in-memory"]')).toBeNull();
  });

  describe('the count badge', () => {
    const badge = async (entries: AuditEntry[], shown: AuditEntry[], query = '') => {
      const store = configure('mock', entries);
      store.filtered.set(shown);
      const fixture = TestBed.createComponent(AuditHome);
      // After creation: the screen takes its first query from the URL.
      store.query.set(query);
      await fixture.whenStable();
      return (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="audit-live-count"]')
        ?.textContent?.trim();
    };
    const seed = entry('a', 'ada');
    const live = { ...entry('b', 'ada'), source: 'iam' } as AuditEntry;

    it('counts the whole trail with no filter', async () => {
      expect(await badge([seed, live], [seed, live])).toBe('2 events · 1 live');
    });

    it('says "event" for one', async () => {
      expect(await badge([live], [live])).toBe('1 event · 1 live');
    });

    it('reports what a filter left on screen, out of the whole trail', async () => {
      expect(await badge([seed, live], [seed], 'ada')).toBe('1 of 2 events · 0 live');
    });

    it('does not count out of nothing while the trail is loading', async () => {
      expect(await badge([], [], 'ada')).toBe('0 events · 0 live');
    });
  });

  it('gives each timestamp a zone', async () => {
    configure('mock', [entry('a', 'ada')]);
    const fixture = TestBed.createComponent(AuditHome);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="audit-row"]')?.textContent).toContain(
      '2026-01-01 00:00 UTC'
    );
  });

  describe('the filter in the URL', () => {
    const ENTRIES = [entry('a', 'grace@example.com'), entry('b', 'ada@example.com'), entry('c', 'ada@example.com')];

    const results = (harness: RouterTestingHarness) =>
      harness.routeNativeElement?.querySelector('[data-testid="audit-filter-results"]')?.textContent;
    const type = (harness: RouterTestingHarness, value: string) => {
      const input = harness.routeNativeElement?.querySelector<HTMLInputElement>(
        '[data-testid="audit-filter"]'
      ) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    async function settle(ms = 300): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
      TestBed.tick();
      // The router finishes on timers of its own, and whenStable would wait on them.
      await vi.advanceTimersByTimeAsync(50);
      TestBed.tick();
    }

    it('opens on the filter a link carries, and reports the count', async () => {
      const store = configure('mock', ENTRIES);
      const harness = await RouterTestingHarness.create('/audit?q=grace');
      await settle(0);

      expect(store.query()).toBe('grace');
      expect(results(harness)).toBe('1 of 3 events matches.');
    });

    it('stays silent with no filter', async () => {
      configure('mock', ENTRIES);
      const harness = await RouterTestingHarness.create('/audit');
      await settle(0);

      expect(results(harness)).toBe('');
    });

    it('does not report a count before there are rows to count', async () => {
      const store = configure('mock');
      store.isPending.set(true);
      const harness = await RouterTestingHarness.create('/audit?q=grace');
      await settle(0);

      expect(results(harness)).toBe('');
    });

    it('filters at once, but answers and writes the URL only when typing pauses', async () => {
      const store = configure('mock', ENTRIES);
      const harness = await RouterTestingHarness.create('/audit');
      const router = TestBed.inject(Router);

      type(harness, 'ad');
      expect(store.query()).toBe('ad');
      await settle(100);
      type(harness, 'ada');
      expect(store.query()).toBe('ada');
      await settle(100);
      expect(router.url).toBe('/audit');
      expect(results(harness)).toBe('');

      await settle();
      expect(router.url).toBe('/audit?q=ada');
      expect(results(harness)).toBe('2 of 3 events match.');
    });

    it('takes the filter out of the URL when it is cleared, and follows Back or a nav link', async () => {
      const store = configure('mock', ENTRIES);
      const harness = await RouterTestingHarness.create('/audit?q=ada');
      const router = TestBed.inject(Router);

      type(harness, '');
      await settle();
      expect(router.url).toBe('/audit');

      void router.navigateByUrl('/audit?q=grace');
      await settle(0);
      expect(store.query()).toBe('grace');
    });

    it('leaves the URL alone if the screen goes before typing settles', async () => {
      configure('mock', ENTRIES);
      const harness = await RouterTestingHarness.create('/audit');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

      type(harness, 'ada');
      harness.fixture.destroy();
      await vi.advanceTimersByTimeAsync(300);

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
