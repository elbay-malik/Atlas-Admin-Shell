import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
} from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { AtlasRole } from '@atlas/shared-contracts';
import { UiActionStatus, UiBadge, UiButton, UiShortId } from '@atlas/shared-ui';
import { IamUser } from '../data/iam-api';
import {
  IamUsersStore,
  SIGNED_OUT_REFUSAL,
  refuseDeactivate,
  refuseRoleChange,
} from '../data/iam-users.store';

@Component({
  selector: 'iam-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiActionStatus, UiBadge, UiButton, UiShortId],
  template: `
    <section class="p-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 grow basis-[20rem]">
          <h1 class="mb-1 text-2xl font-semibold">Identity &amp; Access</h1>
          <p class="text-text-muted">Users, roles and access management.</p>
          <ui-action-status
            [status]="store.lastChange()"
            (undo)="undo()"
            (expired)="store.dismissLastChange()"
          />
        </div>
        <div class="flex items-center gap-2">
          <!--
            Active admins, not admin roles: the same number the refusals below use,
            and the one that decides who can still administer anything.
          -->
          <ui-badge tone="success" data-testid="admin-count">
            {{ store.activeAdminCount() }} active {{ store.activeAdminCount() === 1 ? 'admin' : 'admins' }}
          </ui-badge>
          <ui-badge data-testid="active-count">
            {{ store.activeCount() }} active {{ store.activeCount() === 1 ? 'user' : 'users' }}
          </ui-badge>
        </div>
      </header>

      <!--
        What this line proves: the remote holds no identity of its own, and this
        is the shell's auth singleton read across the federation boundary. The
        name is a raw id when the token has no name or email, so that case gets
        the short form rather than a blank or a 36-character string.
      -->
      <p class="mb-6 flex flex-wrap items-center gap-x-1.5 text-sm" data-testid="session-info">
        @if (auth.user(); as user) {
          <span class="text-text-muted">Session from the shell, across the federation boundary:</span>
          @if (user.email || user.name !== user.id) {
            <strong class="min-w-0 break-words font-semibold">{{ user.email || user.name }}</strong>
          } @else {
            <span class="text-text-muted">account</span>
            <ui-short-id [value]="user.id" label="account ID" />
          }
          <span>({{ user.role }})</span>
        } @else {
          <span class="text-text-muted">Signed out, so changes are disabled.</span>
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
                  [attr.aria-describedby]="visibleReason(roleRefusal(user)) ? 'role-reason-' + user.id : null"
                  [attr.aria-busy]="isPending(user.id)"
                  [attr.aria-label]="'Role for ' + user.name"
                  (change)="onRoleChange(user, $event)"
                >
                  <option value="admin">admin</option>
                  <option value="viewer">viewer</option>
                </select>
                @if (visibleReason(roleRefusal(user)); as reason) {
                  <p
                    data-testid="role-refusal"
                    [attr.id]="'role-reason-' + user.id"
                    class="mt-1 max-w-[28ch] text-xs text-text-muted"
                  >
                    {{ reason }}
                  </p>
                }
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
                  {{ user.active ? 'active' : 'deactivated' }}
                </ui-badge>
              </td>
              <td class="py-2">
                <!--
                  Disabled rather than allowed-and-rejected: the operator should
                  not be able to reach for the one action that would lock them
                  out. The store refuses it too, because a hidden control is not
                  the same as an impossible change.

                  The reason is written beside the control, because a tooltip on a
                  disabled control depends on a pointer and on hovering something
                  that has stopped responding. It is appended to the accessible
                  name as well, so it travels with the control in a rotor.

                  Quiet red, and only when the action is actually on offer: a
                  refused Deactivate is not a destructive action, it is a fact.
                -->
                <ui-button
                  data-testid="toggle-active"
                  [variant]="user.active && !activeRefusal(user) ? 'danger-quiet' : 'secondary'"
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
                @if (visibleReason(activeRefusal(user)); as reason) {
                  <p data-testid="active-refusal" class="mt-1 max-w-[28ch] text-xs text-text-muted">
                    {{ reason }}
                  </p>
                }
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Why this row's role cannot be changed to viewer, or null when it can. */
  protected roleRefusal(user: IamUser): string | null {
    return refuseRoleChange(user, 'viewer', this.store.refusalContext());
  }

  /** Why this row's active state cannot be flipped, or null when it can. */
  protected activeRefusal(user: IamUser): string | null {
    return refuseDeactivate(user, !user.active, this.store.refusalContext());
  }

  /**
   * The reason to print beside a control. Being signed out is the same reason on
   * every control in the table, and the session line above already says it.
   */
  protected visibleReason(refusal: string | null): string | null {
    return refusal === SIGNED_OUT_REFUSAL ? null : refusal;
  }

  /** True while this row's write is in flight — only that row is disabled. */
  protected isPending(id: string): boolean {
    return this.store.pendingIds().includes(id);
  }

  protected onRoleChange(user: IamUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as AtlasRole;
    this.store.changeRole({ id: user.id, role });
  }

  /**
   * Undo leaves with the offer, and focus would fall to <body> with it. The
   * control that made the change is where the operator was before they reached
   * up to undo. After the render, so its disabled state is current: if the undo
   * left it refused, the row's other control is the nearest place to stand.
   */
  protected undo(): void {
    const change = this.store.lastChange();
    if (!change) return;
    this.store.undoLastChange();
    afterNextRender(
      {
        read: () => {
          const row = Array.from(
            this.host.nativeElement.querySelectorAll<HTMLElement>('[data-testid="user-row"]')
          ).find((candidate) => candidate.dataset['userId'] === change.id);
          const select = row?.querySelector<HTMLSelectElement>('[data-testid="role-select"]');
          const toggle = row?.querySelector<HTMLButtonElement>('[data-testid="toggle-active"] button');
          const inOrder = change.field === 'role' ? [select, toggle] : [toggle, select];
          inOrder.find((control) => control && !control.disabled)?.focus();
        },
      },
      { injector: this.injector }
    );
  }
}
