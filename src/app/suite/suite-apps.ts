import type { AppStorage } from './app-storage';

export interface SuiteApp {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  /** Route of the app; undefined while the app is still planned. */
  readonly route?: string;
  /** Makes the app's data part of project save/load. Lazy, so the app's code isn't loaded up front. */
  readonly loadStorage?: () => Promise<AppStorage>;
}

// Add new apps here (and a matching route in app.routes.ts) to show them in the portal.
export const SUITE_APPS: readonly SuiteApp[] = [
  {
    id: 'battlemap',
    name: 'Battlemap',
    description: ' ',
    icon: 'map',
    route: '/battlemap',
    loadStorage: () => import('../apps/battlemap/battlemap.storage').then((m) => m.battlemapStorage),
  }
];
