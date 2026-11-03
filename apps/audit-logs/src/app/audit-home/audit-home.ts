import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { UiBadge, UiButton, UiPageHeader, UiScrollRegion } from '@atlas/shared-ui';
import { ATLAS_API_MODE } from '@atlas/shared-util';
import { AuditEntry, formatWhen, isLive } from '../data/audit-entry';
import { AuditStore, filterEntries } from '../data/audit.store';

/** Long enough to outlast a burst of typing, short enough to feel like an answer. */
const FILTER_SETTLE_MS = 300;

@Component({
  selector: 'audit-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiBadge, UiButton, UiPageHeader, UiScrollRegion],
  template: `
    <section class="p-6">
      <ui-page-header heading="Audit Logs">
        <p>Searchable trail of platform events, live from every domain.</p>
        @if (inMemory) {
          <p uiPageNote data-testid="audit-in-memory">
            This trail lives in this tab and clears on reload. Its seeded rows are samples, dated
            back from the load.
          </p>
        }
        <!--
          The count used to read "0 live" above four seeded rows, which parses
          as "there are no events". Naming the total first makes the second
          number obviously a subset rather than a contradiction. Under a filter it
          counts what the table shows, out of the whole trail.
        -->
        <ui-badge data-testid="audit-live-count" [tone]="liveCount() > 0 ? 'success' : 'neutral'">
          {{ countLabel() }}
        </ui-badge>
      </ui-page-header>

      @if (store.error(); as message) {
        <div
          data-testid="audit-error"
          role="alert"
          class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md
                 border border-status-danger/40 bg-surface p-4"
        >
          <p class="text-sm text-on-danger">{{ message }}</p>
          <ui-button variant="secondary" (pressed)="store.load()">Retry</ui-button>
        </div>
      }

      <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
      <label class="block w-full max-w-md">
        <span class="sr-only">Filter events by date, actor, action, target or live</span>
        <input
          type="search"
          data-testid="audit-filter"
          placeholder="Filter by date, actor, action, target or live…"
          class="min-h-11 w-full rounded border border-border-strong bg-surface px-3 py-1.5 text-sm
                 placeholder:text-text-muted md:min-h-9"
          [value]="store.query()"
          (input)="onFilter($event)"
        />
      </label>
      <!--
        Always in the DOM, because a region inserted with its text is often not
        announced. It answers once typing settles rather than on every key, which
        would talk over the screen reader's own echo of what was just typed.
      -->
      <p
        role="status"
        aria-live="polite"
        data-testid="audit-filter-results"
        class="text-sm text-text-muted"
      >{{ filterResults() }}</p>
      </div>

      @if (store.isPending() && store.filtered().length === 0) {
        <p data-testid="audit-loading" class="text-sm text-text-muted">Loading audit events…</p>
      }

      <!--
        A dense record table is the one thing that legitimately scrolls
        sideways on a phone: an operator expects to pan a ledger, and dropping
        columns would hide the comparison the table exists for. Containing the
        scroll HERE rather than letting it reach the document is the fix — the
        page itself must never pan, or the chrome drifts off screen with it.

        The cut-off edge alone does not say a column is missing, so the line above
        the table does, for as long as there is something to pan.
      -->
      @if (ledger.overflowing()) {
        <p data-testid="audit-scroll-cue" class="mb-2 text-sm text-text-muted">
          Scroll the table sideways to see every column.
        </p>
      }
      <div uiScrollRegion="Audit events" #ledger="uiScrollRegion">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-border text-text-muted">
            <th scope="col" class="py-2 pr-4 font-medium">When</th>
            <th scope="col" class="py-2 pr-4 font-medium">Actor</th>
            <th scope="col" class="py-2 pr-4 font-medium">Action</th>
            <th scope="col" class="py-2 font-medium">Target</th>
          </tr>
        </thead>
        <tbody>
          @for (event of store.filtered(); track event.id) {
            <tr
              data-testid="audit-row"
              [attr.data-event-id]="event.id"
              [attr.data-source]="event.source"
              class="border-b border-border/60"
            >
              <td class="py-2 pr-4 whitespace-nowrap" [title]="event.at">{{ when(event) }}</td>
              <td class="py-2 pr-4">{{ event.actor }}</td>
              <td class="py-2 pr-4">
                {{ event.action }}
                @if (event.detail; as detail) {
                  <span class="text-text-muted">({{ detail }})</span>
                }
              </td>
              <td class="py-2">
                {{ event.target }}
                @if (isLive(event)) {
                  <ui-badge tone="success">live</ui-badge>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="py-4 text-text-muted">No events match the filter.</td>
            </tr>
          }
        </tbody>
      </table>
      </div>
    </section>
  `,
})
export class AuditHome {
  protected readonly store = inject(AuditStore);
  /** On the mock there is no server keeping this trail, whoever is signed in. */
  protected readonly inMemory = inject(ATLAS_API_MODE) === 'mock';

  protected readonly isLive = isLive;

  /** Live rows among those on screen, so the badge cannot contradict the table. */
  protected readonly liveCount = computed(() => this.store.filtered().filter(isLive).length);

  /** `6 events · 2 live`, or `1 of 6 events · 0 live` while a filter is narrowing it. */
  protected readonly countLabel = computed(() => {
    const total = this.store.entities().length;
    const filtering = total > 0 && this.store.query().trim() !== '';
    const count = filtering ? `${this.store.filtered().length} of ${total}` : `${total}`;
    return `${count} ${total === 1 ? 'event' : 'events'} · ${this.liveCount()} live`;
  });

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** The filter once typing has paused: what the URL holds and the region reports. */
  private readonly settledQuery = signal('');
  private settling: ReturnType<typeof setTimeout> | null = null;

  /** Empty with no filter, and until there are rows a count could be true of. */
  protected readonly filterResults = computed(() => {
    const query = this.settledQuery();
    const total = this.store.entities().length;
    if (!query.trim() || this.store.error() || (this.store.isPending() && total === 0)) return '';
    const found = filterEntries(this.store.entities(), query).length;
    const noun = total === 1 ? 'event' : 'events';
    return `${found} of ${total} ${noun} ${found === 1 ? 'matches' : 'match'}.`;
  });

  constructor() {
    // The URL owns the filter, so a link or a reload lands on the same view, and
    // Back or the nav link can change it. While typing is ahead of the URL the
    // field wins: a slower echo of an earlier value must not rewrite the input.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (this.settling !== null) return;
      const query = params.get('q') ?? '';
      this.store.setQuery(query);
      this.settledQuery.set(query);
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.settling !== null) clearTimeout(this.settling);
    });
  }

  protected onFilter(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.store.setQuery(query);
    if (this.settling !== null) clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = null;
      this.settledQuery.set(query);
      // replaceUrl: Back should leave this screen, not undo one keystroke at a time.
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { q: query.trim() ? query : null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }, FILTER_SETTLE_MS);
  }

  /** Compact, locale-stable timestamp with its zone; the raw ISO value stays in the title. */
  protected when(entry: AuditEntry): string {
    return formatWhen(entry.at);
  }
}
