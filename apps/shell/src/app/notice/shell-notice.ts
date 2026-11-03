import { Injectable, signal } from '@angular/core';

export interface Notice {
  text: string;
  /** `problem` is something that failed; `info` is something the visitor should know. */
  tone: 'info' | 'problem';
}

/**
 * The one line the shell uses to say what happened to the visitor's identity.
 * One at a time, on purpose: the newest is the one that explains the screen.
 * Shell-only state, and never a remote's way of talking.
 */
@Injectable({ providedIn: 'root' })
export class ShellNotice {
  private readonly value = signal<Notice | null>(null);

  readonly current = this.value.asReadonly();

  show(text: string, tone: Notice['tone'] = 'info'): void {
    this.value.set({ text, tone });
  }

  clear(): void {
    this.value.set(null);
  }
}
