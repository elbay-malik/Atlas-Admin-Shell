import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

const STORAGE_KEY = 'atlas.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly dark = signal<boolean>(this.readInitial());

  constructor() {
    effect(() => {
      const dark = this.dark();
      this.document.documentElement.classList.toggle('dark', dark);
      try {
        localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
      } catch {
        // storage unavailable (private mode) — theme just won't persist
      }
    });
  }

  toggle(): void {
    this.dark.update((d) => !d);
  }

  private readInitial(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored === 'dark';
    } catch {
      // fall through to media query
    }
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
