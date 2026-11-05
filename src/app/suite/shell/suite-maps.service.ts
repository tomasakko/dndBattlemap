import { Injector, Service, inject, runInInjectionContext, signal } from '@angular/core';
import { SUITE_APPS, suiteApp } from '../suite-apps';
import type { MapSource } from './panel-tabs.service';

/**
 * Every app's maps, through `SuiteApp.loadMaps`. The sidebar lists them, and apps link to each other's
 * maps through it (a world map marker opening a battlemap) without importing each other.
 */
@Service()
export class SuiteMapsService {
  private readonly injector = inject(Injector);
  private readonly loads = new Map<string, Promise<MapSource | null>>();
  /** Map sources loaded so far, by app id. */
  readonly sources = signal<Readonly<Record<string, MapSource>>>({});

  /** The app's maps, loading the app's map code on first use. Null for apps without maps. */
  load(appId: string): Promise<MapSource | null> {
    let load = this.loads.get(appId);
    if (!load) {
      load = this.create(appId);
      this.loads.set(appId, load);
    }
    return load;
  }

  loadAll(): void {
    for (const app of SUITE_APPS) {
      void this.load(app.id);
    }
  }

  private async create(appId: string): Promise<MapSource | null> {
    const loadMaps = suiteApp(appId)?.loadMaps;
    if (!loadMaps) {
      return null;
    }
    try {
      const factory = await loadMaps();
      const source = runInInjectionContext(this.injector, factory);
      this.sources.update((all) => ({ ...all, [appId]: source }));
      return source;
    } catch (error) {
      this.loads.delete(appId);
      console.error(`Could not load the maps of ${appId}`, error);
      return null;
    }
  }
}
