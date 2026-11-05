import type { AppStorage } from './app-storage';
import type { MapSource } from './shell/panel-tabs.service';

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
   * Lists the app's maps in the sidebar even while another app is open. Lazy like `loadStorage`;
   * the returned factory runs in an injection context.
   */
  readonly loadMaps?: () => Promise<() => MapSource>;
}

// Add new apps here (and a matching route in app.routes.ts). The order is the sidebar order.
export const SUITE_APPS: readonly SuiteApp[] = [
  {
    id: 'worldmap',
    name: 'Worldmap',
    description: ' ',
    icon: 'language',
    route: '/worldmap',
    loadStorage: () => import('../apps/worldmap/worldmap.storage').then((m) => m.worldmapStorage),
    loadMaps: () => import('../apps/worldmap/worldmap.sidebar').then((m) => m.worldmapMaps),
  },
  {
    id: 'battlemap',
    name: 'Battlemap',
    description: ' ',
    icon: 'map',
    route: '/battlemap',
    loadStorage: () => import('../apps/battlemap/battlemap.storage').then((m) => m.battlemapStorage),
    loadMaps: () => import('../apps/battlemap/battlemap.sidebar').then((m) => m.battlemapMaps),
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
