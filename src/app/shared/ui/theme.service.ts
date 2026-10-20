import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

export type ThemeId = 'brown-gold' | 'blue-gold';

export const THEMES: readonly { id: ThemeId; name: string }[] = [
  { id: 'brown-gold', name: 'Brown / gold' },
  { id: 'blue-gold', name: 'Blue / gold' },
];

const STORAGE_KEY = 'dnd-suite-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<ThemeId>(this.load());

  constructor() {
    effect(() => {
      const id = this.theme();
      this.document.documentElement.setAttribute('data-theme', id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // storage unavailable (SSR or private mode): the theme just won't persist
      }
    });
  }

  toggle(): void {
    this.theme.update((id) => (id === 'brown-gold' ? 'blue-gold' : 'brown-gold'));
  }

  private load(): ThemeId {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : 'brown-gold';
    } catch {
      return 'brown-gold';
    }
  }
}
