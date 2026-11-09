import { Injectable, computed, signal } from '@angular/core';

/** Bump the version when the steps change, so a visitor who dismissed the old ones sees the new. */
export const GUIDE_DISMISSED_KEY = 'guide:atlas:v1';
/** "Close" lasts for this tab only. */
export const GUIDE_CLOSED_KEY = 'atlas.guide.closed';

// Blocked storage (a privacy mode, a sandboxed frame) throws. The guide then
// simply shows on every visit, which is the harmless way to be wrong.
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // see read()
  }
}

/**
 * Whether the first-visit guide is open. Shell state only: the remotes know
 * nothing about it, and nothing about it is sent anywhere.
 */
@Injectable({ providedIn: 'root' })
export class FirstVisitGuide {
  private readonly state = signal<'open' | 'closed'>(
    read(() => localStorage, GUIDE_DISMISSED_KEY) === 'dismissed' ||
      read(() => sessionStorage, GUIDE_CLOSED_KEY) === 'closed'
      ? 'closed'
      : 'open'
  );

  readonly open = computed(() => this.state() === 'open');

  /**
   * True once the visitor asked for the guide from the nav. On a phone the guide
   * opens by itself only on the Overview, so it never covers a domain's controls
   * unasked; asked for, it shows wherever the visitor is.
   */
  readonly requested = signal(false);

  /**
   * On a phone or a short screen the guide starts as a one-line bar, because the
   * full card would cover the Overview's own way in. It expands when asked.
   */
  readonly expanded = signal(false);

  close(): void {
    write(() => sessionStorage, GUIDE_CLOSED_KEY, 'closed');
    this.expanded.set(false);
    this.state.set('closed');
  }

  dismiss(): void {
    write(() => localStorage, GUIDE_DISMISSED_KEY, 'dismissed');
    this.close();
  }

  expand(): void {
    this.expanded.set(true);
  }

  /** Reopening does not forget "Don't show again": it only shows the guide now. */
  reopen(): void {
    this.requested.set(true);
    this.expanded.set(true);
    this.state.set('open');
  }
}
