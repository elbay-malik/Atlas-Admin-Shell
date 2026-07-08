import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
}

@Component({
  selector: 'flags-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-6">
      <h1 class="text-2xl font-semibold mb-1">Feature Flags</h1>
      <p class="mb-6 opacity-70">Toggle features per environment.</p>
      <ul class="space-y-3">
        @for (flag of flags(); track flag.key) {
          <li class="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <code class="text-sm">{{ flag.key }}</code>
              <p class="text-sm opacity-70">{{ flag.description }}</p>
            </div>
            <button
              type="button"
              class="text-sm px-3 py-1 rounded border"
              [attr.aria-pressed]="flag.enabled"
              (click)="toggle(flag.key)"
            >
              {{ flag.enabled ? 'On' : 'Off' }}
            </button>
          </li>
        }
      </ul>
    </section>
  `,
})
export class FlagsHome {
  readonly flags = signal<FeatureFlag[]>([
    { key: 'new-dashboard', description: 'Next-gen dashboard layout', enabled: true },
    { key: 'bulk-export', description: 'CSV export for audit logs', enabled: false },
    { key: 'sso-enforced', description: 'Require SSO for all tenants', enabled: false },
  ]);

  toggle(key: string): void {
    this.flags.update((flags) =>
      flags.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f))
    );
  }
}
