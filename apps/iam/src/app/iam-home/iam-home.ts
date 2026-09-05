import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { AtlasRole } from '@atlas/shared-contracts';
import { UiBadge, UiButton } from '@atlas/shared-ui';
import { IamUser } from '../data/iam-api';
import { IamUsersStore } from '../data/iam-users.store';

@Component({
  selector: 'iam-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiBadge, UiButton],
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

      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-border text-text-muted">
            <th scope="col" class="py-2 pr-4 font-medium">Name</th>
            <th scope="col" class="py-2 pr-4 font-medium">Email</th>
            <th scope="col" class="py-2 pr-4 font-medium">Role</th>
            <th scope="col" class="py-2 font-medium">Status</th>
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
                  class="rounded border border-border-strong bg-surface px-2 py-1 text-sm
                         disabled:cursor-not-allowed disabled:opacity-50"
                  [value]="user.role"
                  [attr.aria-busy]="isPending(user.id)"
                  [attr.aria-label]="'Role for ' + user.name"
                  (change)="onRoleChange(user, $event)"
                >
                  <option value="admin">admin</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
              <td class="py-2">
                <ui-button
                  data-testid="toggle-active"
                  variant="secondary"
                  [ariaLabel]="(user.active ? 'Deactivate ' : 'Activate ') + user.name"
                  [busy]="isPending(user.id)"
                  (pressed)="store.setActive({ id: user.id, active: !user.active })"
                >
                  {{ user.active ? 'Deactivate' : 'Activate' }}
                </ui-button>
                <span class="ml-2 text-text-muted">{{ user.active ? 'active' : 'disabled' }}</span>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class IamHome {
  protected readonly auth = inject(AtlasAuth);
  protected readonly store = inject(IamUsersStore);

  /** True while this row's write is in flight — only that row is disabled. */
  protected isPending(id: string): boolean {
    return this.store.pendingIds().includes(id);
  }

  protected onRoleChange(user: IamUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as AtlasRole;
    this.store.changeRole({ id: user.id, role });
  }
}
