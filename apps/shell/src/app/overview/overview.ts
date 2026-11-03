import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AtlasAuth } from '@atlas/shared-auth';
import { RemoteDefinition } from '@atlas/shared-contracts';
import { UiBadge, UiBadgeTone, UiButton, UiIcon } from '@atlas/shared-ui';
import { DEMO_SESSION } from '../auth/demo-session';
import { IdentityFlow } from '../auth/identity-flow';
import { ATLAS_MANIFEST } from '../manifest.token';
import {
  REMOTE_STATUS_LABEL,
  RemoteHealthStore,
  RemoteStatus,
  UNKNOWN_REMOTE_HEALTH,
} from '../remotes/remote-health.store';
import { originOf } from '../remotes/remote-origin';

interface RemoteRow extends RemoteDefinition {
  name: string;
  status: RemoteStatus;
  /** The remote's own origin, or the raw url when it is relative. */
  origin: string;
  allowed: boolean;
}

/** Tone and hint per health state; the words themselves are REMOTE_STATUS_LABEL. */
const STATE: Record<RemoteStatus, { tone: UiBadgeTone; hint: string }> = {
  // seed() marks a remote 'unknown' when its remoteEntry.json WAS fetched
  // during initFederation but its code has not been imported yet. That is the
  // normal resting state of a lazily loaded remote, and saying so is the point.
  unknown: { tone: 'neutral', hint: 'Entry fetched at boot; code loads on first visit' },
  loading: { tone: 'warning', hint: 'Fetching the module now' },
  ready: { tone: 'success', hint: 'Module imported and running in this page' },
  down: { tone: 'danger', hint: 'Could not be loaded from its origin' },
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
  imports: [RouterLink, UiBadge, UiButton, UiIcon],
  template: `
    <section class="p-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="mb-1 text-2xl font-semibold">Overview</h1>
          <p class="max-w-measure text-pretty text-text-muted">
            Atlas Admin is one console, composed in the browser from a shell and
            {{ remotes().length }} independently deployed
            {{ remotes().length === 1 ? 'remote' : 'remotes' }}. The table below is the
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
        Above the registry, because for a cold visitor this is the way in: sign-in
        is the slower path, and usually ends in a viewer. Absent from the DOM when
        the deployment does not offer it, not just hidden.
      -->
      @if (demo; as session) {
        @if (session.active()) {
          <p class="mb-6 max-w-measure text-sm text-pretty" data-testid="overview-demo-running">
            Open
            @for (remote of remotes(); track remote.name; let last = $last) {
              @if (last && !$first) {
                or
              }
              <a class="underline underline-offset-2" [routerLink]="'/' + remote.route">{{
                remote.displayName
              }}</a>{{ last ? '.' : ',' }}
            }
            Each one loads from its own origin the first time, and its Module badge below turns to
            loaded.
          </p>
        } @else if (!auth.user()) {
          <div class="mb-6 flex flex-col items-start gap-2" data-testid="overview-demo">
            <ui-button (pressed)="exploreDemo()">Explore with demo data (no account)</ui-button>
            <p class="max-w-measure text-sm text-pretty text-text-muted">
              Loads the real remotes on mock data, labelled as a demo on every screen. It is not a
              sign-in: no token exists, so the edge BFF is not exercised.
            </p>
          </div>
        }
      }

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
                <!--
                  A link only where it would go somewhere. A domain this visitor may
                  not open stays text, like its locked nav item, and the Requires
                  column beside it says why.
                -->
                @if (remote.allowed) {
                  <a
                    class="inline-flex items-center gap-2 underline underline-offset-2 hover:text-text"
                    data-testid="overview-remote-link"
                    [routerLink]="'/' + remote.route"
                  >
                    <ui-icon [name]="remote.icon" />
                    {{ remote.displayName }}
                  </a>
                } @else {
                  <span class="inline-flex items-center gap-2">
                    <ui-icon [name]="remote.icon" />
                    {{ remote.displayName }}
                  </span>
                }
              </td>
              <td class="py-2 pr-4 font-mono text-xs">/{{ remote.route }}</td>
              <!-- the whole point: each domain is served from its own origin -->
              <td class="py-2 pr-4 font-mono text-xs" [title]="remote.url">{{ remote.origin }}</td>
              <td class="py-2 pr-4">
                <span [class.text-text-muted]="!remote.allowed">{{ remote.requiredRole }}</span>
              </td>
              <td class="py-2">
                <ui-badge [tone]="state(remote).tone" [title]="state(remote).hint">
                  {{ label(remote) }}
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
              @if (remote.allowed) {
                <a
                  class="inline-flex min-h-11 min-w-0 items-center gap-2 font-medium underline underline-offset-2"
                  data-testid="overview-remote-link"
                  [routerLink]="'/' + remote.route"
                >
                  <ui-icon [name]="remote.icon" />
                  <span class="truncate">{{ remote.displayName }}</span>
                </a>
              } @else {
                <span class="inline-flex min-w-0 items-center gap-2 font-medium">
                  <ui-icon [name]="remote.icon" />
                  <span class="truncate">{{ remote.displayName }}</span>
                </span>
              }
              <ui-badge [tone]="state(remote).tone">{{ label(remote) }}</ui-badge>
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

      <!--
        Written out, at every width: the badge's title is hover text, which a phone
        never shows, and "resolved" is the word on this screen a visitor can least guess.
      -->
      @if (remotes().length) {
        <p class="mt-3 max-w-measure text-sm text-pretty text-text-muted" data-testid="overview-state-note">
          <span class="block">
            <span class="font-medium text-text">resolved</span>: the remote's entry file was fetched
            at boot, and its code loads on the first visit.
          </span>
          <span class="block">
            <span class="font-medium text-text">loaded</span>: that code is running in this page.
          </span>
        </p>
      }

      @if (!auth.user()) {
        <p class="mt-4 max-w-measure text-sm text-pretty text-text-muted" data-testid="overview-signed-out">
          Every domain is listed before anyone signs in, because the shell fetches this registry
          before authenticating and it names each remote's required role. Opening one needs that
          role — sign in from the header{{ demo ? ', or explore with demo data above' : '' }}.
        </p>
        @if (nhost) {
          <p class="mt-2 max-w-measure text-sm text-pretty text-text-muted" data-testid="overview-signin-note">
            Sign-in runs on a free Nhost project that sleeps when idle, so it may need the project to
            be woken up first. If the sign-in page does not load, the console on this page still shows
            the composition.
          </p>
        }
      }
    </section>
  `,
})
export class Overview {
  protected readonly manifest = inject(ATLAS_MANIFEST);
  protected readonly auth = inject(AtlasAuth);
  private readonly health = inject(RemoteHealthStore);
  private readonly flow = inject(IdentityFlow);
  private readonly document = inject(DOCUMENT);
  protected readonly demo = inject(DEMO_SESSION, { optional: true });
  /** The wake note is about Nhost, so a deployment on any other provider never shows it. */
  protected readonly nhost = this.manifest.auth?.kind === 'nhost';

  protected exploreDemo(): void {
    this.flow.enterDemo();
    // The button just pressed is gone; without this focus falls to <body>.
    this.document.querySelector<HTMLElement>('#main-content')?.focus();
  }

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

  protected label(remote: RemoteRow): string {
    return REMOTE_STATUS_LABEL[remote.status];
  }
}
