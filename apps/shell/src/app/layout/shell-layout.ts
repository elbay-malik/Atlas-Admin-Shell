import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiNavItem, UiThemeToggle } from '@atlas/shared-ui';

interface NavEntry {
  route: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, UiNavItem, UiThemeToggle],
  template: `
    <div class="flex min-h-screen">
      <aside class="flex w-60 flex-col border-r border-border bg-surface">
        <div class="flex h-14 items-center gap-2 border-b border-border px-4">
          <span class="text-lg" aria-hidden="true">🧭</span>
          <span class="font-semibold tracking-tight">Atlas Admin</span>
        </div>
        <nav class="flex-1 space-y-1 p-3" aria-label="Primary">
          <ui-nav-item link="/" icon="⌂" [exact]="true">Overview</ui-nav-item>
          @for (entry of navEntries(); track entry.route) {
            <ui-nav-item [link]="entry.route" [icon]="entry.icon">{{ entry.label }}</ui-nav-item>
          }
        </nav>
      </aside>
      <div class="flex flex-1 flex-col">
        <header class="flex h-14 items-center justify-end gap-3 border-b border-border bg-surface px-4">
          <ui-theme-toggle />
        </header>
        <main class="flex-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellLayout {
  // placeholder entries — replaced by manifest-derived nav once federation lands
  readonly navEntries = signal<NavEntry[]>([
    { route: '/iam', label: 'Identity & Access', icon: '👥' },
    { route: '/flags', label: 'Feature Flags', icon: '🚩' },
    { route: '/audit', label: 'Audit Logs', icon: '🧾' },
  ]);
}
