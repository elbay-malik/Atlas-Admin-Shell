import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'shell-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-6">
      <h1 class="mb-1 text-2xl font-semibold">Welcome to Atlas</h1>
      <p class="max-w-prose opacity-70">
        This shell composes independently deployed domain modules at runtime. Pick a domain from
        the navigation — each one is its own application, loaded on demand.
      </p>
    </section>
  `,
})
export class Overview {}
