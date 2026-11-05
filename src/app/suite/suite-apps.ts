import type { Type } from '@angular/core';
import type { AppStorage } from './app-storage';
import type { SearchSource } from './search/search-item';
import type { MapSource } from './shell/panel-tabs.service';

/** What an app shows on the player screen. Everything is lazy, so the app's code isn't loaded up front. */
export interface PlayerPresenter {
  /** Shown on the player screen while it switches to this app. */
  readonly loading: { readonly title: string; readonly subtitle?: string; readonly icon: string };
  /** The app's player-side component; it reads what to show from the app's own sync mirror. */
  readonly loadScreen: () => Promise<Type<unknown>>;
  /**
   * DM side: starts publishing the app's player view. The returned factory runs in an injection context.
   * The suite calls it while this app is on the stage.
   */
  readonly loadHost: () => Promise<() => void>;
}

export interface SuiteApp {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Material Symbols name shown in the sidebar. */
  readonly icon: string;
  /** Draws the icon solid instead of outlined. */
  readonly iconFilled?: boolean;
  /** Route of the app; undefined while the app is still planned. */
  readonly route?: string;
  /** Makes the app's data part of project save/load. Lazy, so the app's code isn't loaded up front. */
  readonly loadStorage?: () => Promise<AppStorage>;
  /**
   * Lists the app's maps in the sidebar even while another app is open, and lets other apps link to them.
   * Lazy like `loadStorage`; the returned factory runs in an injection context.
   */
  readonly loadMaps?: () => Promise<() => MapSource>;
  /** What the search bar can find in the app. Lazy too; the factory runs in an injection context. */
  readonly loadSearch?: () => Promise<() => SearchSource>;
  /** How the app appears on the player screen, if it does. */
  readonly player?: PlayerPresenter;
}

// Add new apps here (and a matching route in app.routes.ts). The order is the sidebar order.
export const SUITE_APPS: readonly SuiteApp[] = [
  {
    id: 'worldmap',
    name: 'Worldmap',
    description: ' ',
    icon: 'language',
    route: '/worldmap',
    loadStorage: () => import('../apps/worldmap/suite/worldmap.storage').then((m) => m.worldmapStorage),
    loadMaps: () => import('../apps/worldmap/suite/worldmap.sidebar').then((m) => m.worldmapMaps),
    loadSearch: () => import('../apps/worldmap/suite/worldmap.search').then((m) => m.worldmapSearch),
    player: {
      loading: { title: 'Your Dungeon Master is loading the world map', icon: 'language' },
      loadScreen: () =>
        import('../apps/worldmap/player-screen/player-screen').then((m) => m.WorldmapPlayerScreen),
      loadHost: () => import('../apps/worldmap/suite/worldmap.presenter').then((m) => m.startWorldmapHost),
    },
  },
  {
    id: 'battlemap',
    name: 'Battlemap',
    description: ' ',
    icon: 'map',
    route: '/battlemap',
    loadStorage: () => import('../apps/battlemap/suite/battlemap.storage').then((m) => m.battlemapStorage),
    loadMaps: () => import('../apps/battlemap/suite/battlemap.sidebar').then((m) => m.battlemapMaps),
    loadSearch: () => import('../apps/battlemap/suite/battlemap.search').then((m) => m.battlemapSearch),
    player: {
      loading: {
        title: 'Your Dungeon Master is loading the battlemap',
        subtitle: 'Prepare for possible battle!',
        icon: 'swords',
      },
      loadScreen: () =>
        import('../apps/battlemap/player-screen/player-screen').then((m) => m.BattlemapPlayerScreen),
      loadHost: () => import('../apps/battlemap/suite/battlemap.presenter').then((m) => m.startBattlemapHost),
    },
  },
  {
    id: 'storyteller',
    name: 'Storyteller',
    description: ' ',
    icon: 'stat_0',
  },
  {
    id: 'wiki',
    name: 'Wiki',
    description: ' ',
    icon: 'book_2',
  },
  {
    id: 'characters',
    name: 'Characters',
    description: ' ',
    icon: 'person',
  },
];

export function suiteApp(id: string): SuiteApp | undefined {
  return SUITE_APPS.find((app) => app.id === id);
}
