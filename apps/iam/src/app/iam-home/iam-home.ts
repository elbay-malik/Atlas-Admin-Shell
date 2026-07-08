import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

interface IamUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'viewer';
  active: boolean;
}

@Component({
  selector: 'iam-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-6">
      <h1 class="text-2xl font-semibold mb-1">Identity &amp; Access</h1>
      <p class="mb-6 opacity-70">Users, roles and access management.</p>
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b opacity-60">
            <th class="py-2 pr-4">Name</th>
            <th class="py-2 pr-4">Email</th>
            <th class="py-2 pr-4">Role</th>
            <th class="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (user of users(); track user.id) {
            <tr class="border-b border-black/5">
              <td class="py-2 pr-4">{{ user.name }}</td>
              <td class="py-2 pr-4">{{ user.email }}</td>
              <td class="py-2 pr-4">{{ user.role }}</td>
              <td class="py-2">{{ user.active ? 'active' : 'disabled' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class IamHome {
  readonly users = signal<IamUser[]>([
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@atlas.dev', role: 'admin', active: true },
    { id: 'u-2', name: 'Grace Hopper', email: 'grace@atlas.dev', role: 'admin', active: true },
    { id: 'u-3', name: 'Alan Turing', email: 'alan@atlas.dev', role: 'viewer', active: true },
    { id: 'u-4', name: 'Katherine Johnson', email: 'kj@atlas.dev', role: 'viewer', active: false },
  ]);
}
