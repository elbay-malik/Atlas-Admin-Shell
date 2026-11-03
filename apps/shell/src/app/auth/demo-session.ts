import {
  EnvironmentProviders,
  Injectable,
  InjectionToken,
  Signal,
  Type,
  computed,
  effect,
  inject,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import { AtlasAuth, AtlasLoginHint, AuthUser } from '@atlas/shared-auth';
import {
  ALLOWED_ROLES_CLAIM,
  AtlasManifest,
  CLAIMS_NAMESPACE,
  DISPLAY_NAME_CLAIMS,
  EMAIL_CLAIM,
} from '@atlas/shared-contracts';
import { ATLAS_API_MODE } from '@atlas/shared-util';
import { toAuthUser } from './claims';

/**
 * Who a demo visitor is. These literals are not a token and are never encoded
 * into one. They go through toAuthUser so that the role still has exactly one
 * source, toAtlasRole, rather than a second path for a second kind of user.
 */
const DEMO_CLAIMS: Record<string, unknown> = {
  sub: 'demo',
  [CLAIMS_NAMESPACE]: {
    [ALLOWED_ROLES_CLAIM]: ['admin'],
    [EMAIL_CLAIM]: 'demo@atlas.dev',
    [DISPLAY_NAME_CLAIMS[0]]: 'Demo visitor',
  },
};

export const DEMO_USER: AuthUser = Object.freeze(toAuthUser(DEMO_CLAIMS) as AuthUser);

/**
 * Whether this deployment may offer the demo path (ADR-0015).
 *
 * Takes the VALIDATED manifest, so an out-of-contract apiMode has already become
 * zero remotes and answers false here. A console with no remotes has nothing to
 * demonstrate, and "mock" must be what the manifest says, never a guess.
 */
export function isDemoAvailable(manifest: AtlasManifest): boolean {
  return (manifest.apiMode ?? 'mock') === 'mock' && Object.keys(manifest.remotes).length > 0;
}

/** The demo as the shell's own screens see it. Absent from DI when not offered. */
export interface DemoSession {
  /** True only while the demo is what the console is showing. */
  readonly active: Signal<boolean>;
  /** Starts the demo. Refused, returning false, while a real session exists. */
  enter(): boolean;
}

export const DEMO_SESSION = new InjectionToken<DemoSession>('atlas.demo-session');

/** The provider that does the real work, whichever one the manifest chose. */
const REAL_ATLAS_AUTH = new InjectionToken<AtlasAuth>('atlas.real-auth');

/**
 * Puts an explicit, visitor-chosen demo in front of the configured provider. A
 * demo is not a login:
 *
 * - It has no credential. `getAccessToken` answers null, so the interceptor sends
 *   no Authorization header and the edge would answer 401.
 * - `isAuthenticated` stays the real provider's answer, so it stays false.
 * - It is held in memory only. Nothing is stored, so a reload cannot resume it
 *   and no stored persona can start it. The only way in is `enter()`.
 * - A real user always wins, and ends the demo for good: losing that real session
 *   later lands on plain signed-out, never back in the demo.
 *
 * `user` does carry the demo user, because that is what the role gate and the
 * remotes read. That gate is UX (ADR-0011), and every write it unlocks goes to a
 * mock API.
 */
@Injectable()
export class DemoAtlasAuth extends AtlasAuth implements DemoSession {
  private readonly real = inject(REAL_ATLAS_AUTH);
  private readonly entered = signal(false);

  readonly active = computed(() => this.entered() && this.real.user() === null);
  readonly user = computed(() => this.real.user() ?? (this.active() ? DEMO_USER : null));
  readonly isAuthenticated = this.real.isAuthenticated;

  constructor() {
    super();
    // bootstrap already declines to install this outside mock mode. This is the
    // second lock, in case a future caller does not.
    if (inject(ATLAS_API_MODE) !== 'mock') {
      throw new Error('The demo session exists only when apiMode is "mock" (ADR-0015).');
    }
    effect(() => {
      if (this.real.user()) this.entered.set(false);
    });
  }

  enter(): boolean {
    if (this.real.user()) return false;
    this.entered.set(true);
    return true;
  }

  init(): Promise<void> {
    return this.real.init();
  }

  /**
   * The demo stays until a real user exists. A provider's sign-in leaves the page,
   * which ends the demo with the memory holding it, and one that fails to start
   * leaves the visitor where they were, still labelled.
   */
  async login(hint?: AtlasLoginHint): Promise<void> {
    await this.real.login(hint);
    if (this.real.user()) this.entered.set(false);
  }

  async logout(): Promise<void> {
    const wasDemo = this.active();
    this.entered.set(false);
    if (!wasDemo) await this.real.logout();
  }

  async getAccessToken(): Promise<string | null> {
    return this.active() ? null : this.real.getAccessToken();
  }
}

/**
 * Layered after the real provider's own providers, so the later AtlasAuth wins
 * and the app initializer they installed reaches `init` through this one.
 */
export function provideDemoSession(real: Type<AtlasAuth>): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: REAL_ATLAS_AUTH, useClass: real },
    { provide: AtlasAuth, useClass: DemoAtlasAuth },
    { provide: DEMO_SESSION, useExisting: AtlasAuth },
  ]);
}
