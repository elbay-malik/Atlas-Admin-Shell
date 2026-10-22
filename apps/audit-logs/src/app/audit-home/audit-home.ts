import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { UiBadge, UiButton } from '@atlas/shared-ui';
import { AuditEntry } from '../data/audit-entry';
import { AuditStore } from '../data/audit.store';

@Component({
  selector: 'audit-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiBadge, UiButton],
  template: `
    <section class="p-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="mb-1 text-2xl font-semibold">Audit Logs</h1>
          <p class="text-text-muted">
            Searchable trail of platform events, live from every domain.
          </p>
        </div>
        <!--
          The count used to read "0 live" above four seeded rows, which parses
          as "there are no events". Naming the total first makes the second
          number obviously a subset rather than a contradiction.
        -->
        <ui-badge data-testid="audit-live-count" [tone]="liveCount() > 0 ? 'success' : 'neutral'">
          {{ store.entities().length }} events · {{ liveCount() }} live
        </ui-badge>
      </header>

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

      <label class="mb-4 block max-w-md">
        <span class="sr-only">Filter events by actor, action or target</span>
        <input
          type="search"
          data-testid="audit-filter"
          placeholder="Filter by actor, action or target…"
          class="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm
                 placeholder:text-text-muted"
          [value]="store.query()"
          (input)="onFilter($event)"
        />
      </label>

      @if (store.isPending() && store.filtered().length === 0) {
        <p data-testid="audit-loading" class="text-sm text-text-muted">Loading audit events…</p>
      }

      <!--
        A dense record table is the one thing that legitimately scrolls
        sideways on a phone: an operator expects to pan a ledger, and dropping
        columns would hide the comparison the table exists for. Containing the
        scroll HERE rather than letting it reach the document is the fix — the
        page itself must never pan, or the chrome drifts off screen with it.
      -->
      <div class="overflow-x-auto">
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
                @if (event.source !== 'seed') {
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

  /** Rows that arrived over the bus rather than from the seeded backend. */
  protected readonly liveCount = computed(
    () => this.store.entities().filter((entry) => entry.source !== 'seed').length
  );

  protected onFilter(event: Event): void {
    this.store.setQuery((event.target as HTMLInputElement).value);
  }

  /** Compact, locale-stable timestamp; the raw ISO value stays in the title. */
  protected when(entry: AuditEntry): string {
    return entry.at.replace('T', ' ').slice(0, 16);
  }
}
