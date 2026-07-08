import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'shell-module-unavailable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-6">
      <h1 class="mb-1 text-2xl font-semibold">Module unavailable</h1>
      <p class="max-w-prose opacity-70">
        This part of the platform could not be loaded right now. The rest of Atlas keeps working —
        try again in a moment.
      </p>
    </section>
  `,
})
export class ModuleUnavailable {}
