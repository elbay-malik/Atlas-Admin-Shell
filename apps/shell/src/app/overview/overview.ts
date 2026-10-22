import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AtlasAuth } from '@atlas/shared-auth';
import { RemoteDefinition } from '@atlas/shared-contracts';
import { UiBadge, UiBadgeTone, UiIcon } from '@atlas/shared-ui';
import { ATLAS_MANIFEST } from '../manifest.token';
import { RemoteHealthStore, RemoteStatus, UNKNOWN_REMOTE_HEALTH } from '../remotes/remote-health.store';

interface RemoteRow extends RemoteDefinition {
  name: string;
  status: RemoteStatus;
  /** The remote's own origin, or the raw url when it is relative. */
  origin: string;
  allowed: boolean;
}

/** Label and tone per health state, so the vocabulary is defined once. */
const STATE: Record<RemoteStatus, { label: string; tone: UiBadgeTone; hint: string }> = {
  // seed() marks a remote 'unknown' when its remoteEntry.json WAS fetched
  // during initFederation but its code has not been imported yet. That is the
  // normal resting state of a lazily loaded remote, and saying so is the point.
  unknown: { label: 'resolved', tone: 'neutral', hint: 'Entry fetched at boot; code loads on first visit' },
  loading: { label: 'loading', tone: 'warning', hint: 'Fetching the module now' },
  ready: { label: 'loaded', tone: 'success', hint: 'Module imported and running in this page' },
  down: { label: 'unreachable', tone: 'danger', hint: 'Its origin did not answer' },
};

/**
 * The landing screen, and the one place the architecture is visible without
 * something having to go wrong.
 *
 * It used to be two sentences over an empty page, identical signed out, as
 * admin and as viewer. That was the highest-weight surface in the product
 * (PRODUCT.md records that evaluators arrive here cold, unguided, and judge in
 * minutes) and it proved nothing: a visitor was told "this shell composes
 * independently deployed domain modules at runtime" and shown no evidence of
 * it whatsoever. The only screen that demonstrated the architecture was the
 * error boundary, which requires a remote to fail.
 *
 * So this renders the registry itself — every remote the shell booted from,
 * with the origin it came from, the role it needs, and whether its entry
 * resolved. PRODUCT.md's first principle is "architecture must be visible, not
 * just claimed"; this is the claim and its receipt in the same table.
 *
 * It is a table rather than a grid of cards on purpose: it IS tabular data, and
 * the console already has a table language on /audit and /iam that an operator
 * has learned by the time they get here.
 */
@Component({
  selector: 'shell-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiBadge, UiIcon],
  template: `
    <section class="p-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="mb-1 text-2xl font-semibold">Atlas Admin</h1>
          <p class="max-w-prose text-text-muted">
            One console, composed in the browser from
            {{ remotes().length }} independently deployed origins. The table below is the
            registry it booted from — adding a domain to this platform is an edit there, not a
            rebuild of this shell.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <ui-badge data-testid="overview-manifest-version">manifest v{{ manifest.version }}</ui-badge>
          <ui-badge
            data-testid="overview-api-mode"
            [tone]="manifest.apiMode === 'http' ? 'success' : 'neutral'"
          >
            {{ manifest.apiMode ?? 'mock' }} data
          </ui-badge>
        </div>
      </header>

      <!--
        Two presentations of one list, because five columns is the right shape
        at desktop and the wrong one at 390px. The table stays a real table
        where it fits; below md each remote becomes a block, so the origin —
        the part that carries the architecture claim — survives the narrow
        viewport instead of being scrolled off it.
      -->
      <table class="hidden w-full text-left text-sm md:table">
        <thead>
          <tr class="border-b border-border text-text-muted">
            <th scope="col" class="py-2 pr-4 font-medium">Domain</th>
            <th scope="col" class="py-2 pr-4 font-medium">Route</th>
            <th scope="col" class="py-2 pr-4 font-medium">Origin</th>
            <th scope="col" class="py-2 pr-4 font-medium">Requires</th>
            <th scope="col" class="py-2 font-medium">Module</th>
          </tr>
        </thead>
        <tbody>
          @for (remote of remotes(); track remote.name) {
            <tr
              data-testid="overview-remote"
              [attr.data-remote]="remote.name"
              [attr.data-state]="remote.status"
              class="border-b border-border/60"
            >
              <td class="py-2 pr-4">
                <span class="inline-flex items-center gap-2">
                  <ui-icon [name]="remote.icon" />
                  {{ remote.displayName }}
                </span>
              </td>
              <td class="py-2 pr-4 font-mono text-xs">/{{ remote.route }}</td>
              <!-- the whole point: each domain is served from its own origin -->
              <td class="py-2 pr-4 font-mono text-xs" [title]="remote.url">{{ remote.origin }}</td>
              <td class="py-2 pr-4">
                <span [class.text-text-muted]="!remote.allowed">{{ remote.requiredRole }}</span>
              </td>
              <td class="py-2">
                <ui-badge [tone]="state(remote).tone" [title]="state(remote).hint">
                  {{ state(remote).label }}
                </ui-badge>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="py-4 text-text-muted">
                The manifest declares no remotes, so this console has no domains to show.
              </td>
            </tr>
          }
        </tbody>
      </table>

      <ul class="md:hidden">
        @for (remote of remotes(); track remote.name) {
          <li
            data-testid="overview-remote"
            [attr.data-remote]="remote.name"
            [attr.data-state]="remote.status"
            class="flex flex-col gap-1 border-b border-border/60 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="inline-flex min-w-0 items-center gap-2 font-medium">
                <ui-icon [name]="remote.icon" />
                <span class="truncate">{{ remote.displayName }}</span>
              </span>
              <ui-badge [tone]="state(remote).tone">{{ state(remote).label }}</ui-badge>
            </div>
            <span class="font-mono text-xs break-all text-text-muted">{{ remote.origin }}</span>
            <span class="text-xs text-text-muted">
              <span class="font-mono">/{{ remote.route }}</span>
              · needs {{ remote.requiredRole }}
            </span>
          </li>
        } @empty {
          <li class="py-4 text-sm text-text-muted">
            The manifest declares no remotes, so this console has no domains to show.
          </li>
        }
      </ul>

      @if (!auth.isAuthenticated()) {
        <p class="mt-4 max-w-prose text-sm text-text-muted" data-testid="overview-signed-out">
          Every domain is listed before anyone signs in, because the shell fetches this registry
          before authenticating and it names each remote's required role. Opening one needs that
          role — sign in from the header.
        </p>
      }
    </section>
  `,
})
export class Overview {
  protected readonly manifest = inject(ATLAS_MANIFEST);
  protected readonly auth = inject(AtlasAuth);
  private readonly health = inject(RemoteHealthStore);

  protected readonly remotes = computed((): RemoteRow[] => {
    this.auth.user(); // re-evaluate on sign-in and sign-out
    const health = this.health.remotes();
    return Object.entries(this.manifest.remotes).map(([name, def]) => ({
      ...def,
      name,
      status: (health[name] ?? UNKNOWN_REMOTE_HEALTH).status,
      origin: originOf(def.url),
      allowed: this.auth.hasRole(def.requiredRole),
    }));
  });

  protected state(remote: RemoteRow) {
    return STATE[remote.status];
  }
}

/**
 * A manifest may carry a relative url, which resolves against the manifest's
 * own location at boot (ADR-0010). There is no origin to show for one, so the
 * raw value is shown instead of inventing this page's own origin — which would
 * claim the remote is served from here when it is not.
 */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
