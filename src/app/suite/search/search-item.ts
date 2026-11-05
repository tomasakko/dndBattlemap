import type { Signal } from '@angular/core';

/** One thing the search bar can find, e.g. a map, a marker or a creature. */
export interface SearchItem {
  /** Unique across the whole suite. */
  readonly id: string;
  /** Maps are listed first, then what's on them. */
  readonly kind: 'map' | 'entry';
  readonly label: string;
  /** Material Symbols name. */
  readonly icon: string;
  /** Grey text after the label: the map an entry is on. Maps get their app's name instead when another map has the same name. */
  readonly context?: string;
  /** For maps: what kind of map this is, e.g. "worldmap", shown when names clash. */
  readonly mapKind?: string;
  /** Why it can't be opened right now, if it can't. */
  readonly disabledNote?: string;
  /** Selects the item inside its app; the search bar then navigates to `route`. */
  open(): void;
  readonly route: string;
}

/** An app's searchable items. The factory runs in an injection context (see `SuiteApp.loadSearch`). */
export interface SearchSource {
  readonly items: Signal<SearchItem[]>;
}
