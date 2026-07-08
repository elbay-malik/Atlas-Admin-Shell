import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
}

@Component({
  selector: 'audit-home',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-6">
      <h1 class="text-2xl font-semibold mb-1">Audit Logs</h1>
      <p class="mb-6 opacity-70">Searchable trail of platform events.</p>
      <input
        type="search"
        placeholder="Filter by actor or action…"
        class="mb-4 w-full max-w-md rounded border px-3 py-2 text-sm"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
      />
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b opacity-60">
            <th class="py-2 pr-4">When</th>
            <th class="py-2 pr-4">Actor</th>
            <th class="py-2 pr-4">Action</th>
            <th class="py-2">Target</th>
          </tr>
        </thead>
        <tbody>
          @for (event of filtered(); track event.id) {
            <tr class="border-b border-black/5">
              <td class="py-2 pr-4 whitespace-nowrap">{{ event.at }}</td>
              <td class="py-2 pr-4">{{ event.actor }}</td>
              <td class="py-2 pr-4">{{ event.action }}</td>
              <td class="py-2">{{ event.target }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="py-4 opacity-60">No events match the filter.</td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class AuditHome {
  readonly query = signal('');
  readonly events = signal<AuditEvent[]>([
    { id: 'e-1', at: '2026-07-08 09:12', actor: 'ada@atlas.dev', action: 'user.role.changed', target: 'alan@atlas.dev' },
    { id: 'e-2', at: '2026-07-08 08:47', actor: 'grace@atlas.dev', action: 'flag.enabled', target: 'new-dashboard' },
    { id: 'e-3', at: '2026-07-07 17:03', actor: 'ada@atlas.dev', action: 'user.invited', target: 'kj@atlas.dev' },
    { id: 'e-4', at: '2026-07-07 12:30', actor: 'system', action: 'tenant.provisioned', target: 'acme-corp' },
  ]);

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.events();
    return this.events().filter(
      (e) => e.actor.toLowerCase().includes(q) || e.action.toLowerCase().includes(q)
    );
  });
}
