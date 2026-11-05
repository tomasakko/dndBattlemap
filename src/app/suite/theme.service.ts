import { DOCUMENT } from '@angular/common';
import { Service, effect, inject, signal } from '@angular/core';
import { stringPref } from '../shared/storage/local-pref';

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
const themePref = stringPref(
  'dnd-suite-theme',
  'default',
  THEMES.map((theme) => theme.id),
);

/** The colour theme, set as `data-theme` on <html> and remembered across reloads. */
@Service()
export class ThemeService {
  readonly themeId = signal(themePref.read());

  private readonly document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const id = this.themeId();
      this.document.documentElement.dataset['theme'] = id;
      themePref.write(id);
    });
  }

  set(id: string): void {
    if (THEMES.some((theme) => theme.id === id)) {
      this.themeId.set(id);
    }
  }
}
