import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { AtlasRole } from '@atlas/shared-contracts';
import { UiActionStatus, UiBadge, UiButton } from '@atlas/shared-ui';
import { IamUser } from '../data/iam-api';
import { IamUsersStore, refuseDeactivate, refuseRoleChange } from '../data/iam-users.store';

@Component({
  selector: 'iam-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiActionStatus, UiBadge, UiButton],
  template: `
    <section class="p-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="mb-1 text-2xl font-semibold">Identity &amp; Access</h1>
          <p class="text-text-muted">Users, roles and access management.</p>
        </div>
        <div class="flex items-center gap-2">
          <ui-badge tone="success" data-testid="admin-count">
            {{ store.adminCount() }} admins
          </ui-badge>
          <ui-badge data-testid="active-count">{{ store.activeCount() }} active</ui-badge>
        </div>
      </header>

      <!-- reads the SHELL's auth singleton across the federation boundary -->
      <p class="mb-6 text-sm" data-testid="session-info">
        Session:
        @if (auth.user(); as user) {
          <strong>{{ user.email }}</strong> ({{ user.role }})
        } @else {
          anonymous
        }
      </p>

      @if (store.error(); as message) {
        <div
          data-testid="users-error"
          role="alert"
          class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md
                 border border-status-danger/40 bg-surface p-4"
        >
          <p class="text-sm text-on-danger">{{ message }}</p>
          <ui-button variant="secondary" (pressed)="store.loadUsers()">Retry</ui-button>
        </div>
      }

      @if (store.isPending() && store.entities().length === 0) {
        <p data-testid="users-loading" class="text-sm text-text-muted">Loading users…</p>
      }

      <ui-action-status
        [message]="store.lastChange()?.message ?? null"
        (undo)="store.undoLastChange()"
      />

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
            <th scope="col" class="py-2 pr-4 font-medium">Name</th>
            <th scope="col" class="py-2 pr-4 font-medium">Email</th>
            <th scope="col" class="py-2 pr-4 font-medium">Role</th>
            <th scope="col" class="py-2 pr-4 font-medium">Status</th>
            <th scope="col" class="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (user of store.entities(); track user.id) {
            <!--
              Controls stay enabled while a write is in flight and express it
              with aria-busy: disabling the control the user just activated
              moves focus to <body> and loses their place in the table. The
              store's in-flight guard swallows duplicate writes.
            -->
            <tr
              data-testid="user-row"
              [attr.data-user-id]="user.id"
              [attr.data-pending]="isPending(user.id)"
              class="border-b border-border/60"
            >
              <td class="py-2 pr-4">{{ user.name }}</td>
              <td class="py-2 pr-4">{{ user.email }}</td>
              <td class="py-2 pr-4">
                <select
                  data-testid="role-select"
                  class="min-h-11 rounded-md border border-border-strong bg-surface px-3 py-1.5
                         text-sm text-text disabled:cursor-not-allowed disabled:opacity-50
                         md:min-h-0"
                  [value]="user.role"
                  [disabled]="!!roleRefusal(user)"
                  [attr.title]="roleRefusal(user)"
                  [attr.aria-busy]="isPending(user.id)"
                  [attr.aria-label]="'Role for ' + user.name"
                  (change)="onRoleChange(user, $event)"
                >
                  <option value="admin">admin</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
              <!--
                Status and action used to share one cell, which grouped a report
                and a command as if they were one thing. The badge component is
                already used for status in this page's header; the row now uses
                the same vocabulary.
              -->
              <td class="py-2 pr-4">
                <ui-badge
                  data-testid="user-status"
                  [tone]="user.active ? 'success' : 'neutral'"
                >
                  {{ user.active ? 'active' : 'disabled' }}
                </ui-badge>
              </td>
              <td class="py-2">
                <!--
                  Disabled rather than allowed-and-rejected: the operator should
                  not be able to reach for the one action that would lock them
                  out. The store refuses it too, because a hidden control is not
                  the same as an impossible change.

                  The title goes on the HOST element, which is never disabled —
                  a disabled <button> does not reliably surface its own tooltip,
                  since it stops receiving the mouse events that trigger one.
                  The reason is appended to the accessible name as well, so it
                  reaches someone who never sees a tooltip at all.
                -->
                <ui-button
                  data-testid="toggle-active"
                  variant="secondary"
                  [attr.title]="activeRefusal(user)"
                  [disabled]="!!activeRefusal(user)"
                  [ariaLabel]="
                    (user.active ? 'Deactivate ' : 'Activate ') +
                    user.name +
                    (activeRefusal(user) ? '. ' + activeRefusal(user) : '')
                  "
                  [busy]="isPending(user.id)"
                  (pressed)="store.setActive({ id: user.id, active: !user.active })"
                >
                  {{ user.active ? 'Deactivate' : 'Activate' }}
                </ui-button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      </div>
    </section>
  `,
})
export class IamHome {
  protected readonly auth = inject(AtlasAuth);
  protected readonly store = inject(IamUsersStore);

  /** Context the refusals need, recomputed as the table changes. */
  private readonly guardContext = computed(() => ({
    actorEmail: this.auth.user()?.email ?? '',
    adminCount: this.store.entities().filter((u) => u.role === 'admin' && u.active).length,
  }));

  /** Why this row's role cannot be changed to viewer, or null when it can. */
  protected roleRefusal(user: IamUser): string | null {
    return refuseRoleChange(user, 'viewer', this.guardContext());
  }

  /** Why this row cannot be deactivated, or null when it can. */
  protected activeRefusal(user: IamUser): string | null {
    return user.active ? refuseDeactivate(user, false, this.guardContext()) : null;
  }

  /** True while this row's write is in flight — only that row is disabled. */
  protected isPending(id: string): boolean {
    return this.store.pendingIds().includes(id);
  }

  protected onRoleChange(user: IamUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as AtlasRole;
    this.store.changeRole({ id: user.id, role });
  }
}
