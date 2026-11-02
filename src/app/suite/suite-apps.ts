import type { AppStorage } from './app-storage';

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
  },
  {
    id: 'battlemap',
    name: 'Battlemap',
    description: ' ',
    icon: 'map',
    route: '/battlemap',
    loadStorage: () => import('../apps/battlemap/battlemap.storage').then((m) => m.battlemapStorage),
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
