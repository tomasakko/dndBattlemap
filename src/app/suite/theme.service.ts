import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export interface Theme {
  readonly id: string;
  readonly name: string;
  /** Swatch colours shown in the theme menu: background, surface, highlight. */
  readonly swatch: readonly [string, string, string];
}

// The colours themselves live in styles.css under `html[data-theme='<id>']`.
export const THEMES: readonly Theme[] = [
  { id: 'default', name: 'Grey', swatch: ['#2d2d2d', '#626262', '#929292'] },
  { id: 'bordeaux', name: 'Bordeaux', swatch: ['#2a1418', '#5e2a33', '#8e4350'] },
  { id: 'dark-blue', name: 'Dark blue', swatch: ['#121b2c', '#28395a', '#45608f'] },
];

/** Same key as the inline script in index.html, which applies the theme before the app starts. */
const THEME_KEY = 'dnd-suite-theme';

function readTheme(): string {
  try {
    const id = localStorage.getItem(THEME_KEY);
    return THEMES.some((theme) => theme.id === id) ? id! : 'default';
  } catch {
    return 'default';
  }
}

/** The colour theme, set as `data-theme` on <html> and remembered across reloads. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themeId = signal(typeof localStorage === 'undefined' ? 'default' : readTheme());

  private readonly document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const id = this.themeId();
      this.document.documentElement.dataset['theme'] = id;
      try {
        localStorage.setItem(THEME_KEY, id);
      } catch {
        // The theme just won't survive a reload.
      }
    });
  }

  set(id: string): void {
    if (THEMES.some((theme) => theme.id === id)) {
      this.themeId.set(id);
    }
  }
}
