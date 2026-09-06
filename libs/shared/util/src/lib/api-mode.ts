import { InjectionToken } from '@angular/core';

/**
 * Which backend the domains talk to, decided ONCE by the shell and inherited
 * across the federation boundary.
 *
 * It lives in a shared lib for a reason worth stating: an InjectionToken's
 * identity is the object itself, not its description. Declaring "the same"
 * token in the shell and again in each remote produces DISTINCT tokens, so each
 * remote silently resolves its own default and the shell's choice is ignored.
 * That is exactly the bug the browser-to-BFF e2e caught — the remotes kept
 * using their mocks while every unit test passed.
 *
 * Because @atlas/shared-util is a federation sharedMapping, host and remotes
 * see one token instance.
 *
 * The mode follows the AUTH provider: the edge BFF verifies real signed tokens
 * and the mock auth mints a recognisably fake one, so "mock auth plus real API"
 * could only ever produce 401s. The default is mock, which keeps the console
 * runnable with no backend.
 */
export type AtlasApiMode = 'mock' | 'http';

export const ATLAS_API_MODE = new InjectionToken<AtlasApiMode>('ATLAS_API_MODE', {
  providedIn: 'root',
  factory: (): AtlasApiMode => 'mock',
});
