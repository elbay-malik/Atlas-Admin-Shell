import { InjectionToken } from '@angular/core';
import type { NativeFederationResult } from '@angular-architects/native-federation-v4';

/**
 * The WHOLE result of initFederation, not just `loadRemoteModule`.
 *
 * The extra surface is what makes retry possible without a page reload:
 * `initRemoteEntry(url, name)` re-fetches a remoteEntry.json and appends a new
 * import map at runtime, and `adapters.remoteInfoRepo.contains(name)` is the
 * only reliable way to tell whether that worked — in non-strict mode (the v4
 * wrapper cannot turn strict mode on) initRemoteEntry swallows its own failures
 * and resolves anyway (ADR-0007).
 */
export const FEDERATION = new InjectionToken<NativeFederationResult>('FEDERATION');
