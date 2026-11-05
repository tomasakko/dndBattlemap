import {
  Component,
  Injector,
  afterNextRender,
  inject,
  input,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SUITE_APPS, SuiteApp } from '../suite-apps';
import { TabService } from '../tab.service';
import { MapSource, PanelTab, PanelTabsService } from './panel-tabs.service';

const FOLDED_KEY = 'dnd-suite-folded-map-lists';

function readFolded(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Sidebar list of the suite's apps, each listing its maps once it has some. */
@Component({
  selector: 'app-nav',
  templateUrl: './app-nav.html',
  styleUrl: './app-nav.css',
})
export class AppNav {
  /** Icons only, with the names as tooltips. */
  readonly collapsed = input(false);

  protected readonly apps = SUITE_APPS;
  protected readonly tabs = inject(TabService);
  protected readonly panelTabs = inject(PanelTabsService);
  private readonly router = inject(Router);
  /** Maps of every app that has them, loaded lazily so the apps' code isn't in the main bundle. */
  private readonly sources = signal<Record<string, MapSource>>({});
  /** Apps whose map list the DM folded away. */
  private readonly folded = signal<string[]>(readFolded());

  constructor() {
    const injector = inject(Injector);
    // Browser only: the apps keep their maps in IndexedDB.
    afterNextRender(() => {
      for (const app of this.apps) {
        void app.loadMaps?.().then((factory) => {
          const source = runInInjectionContext(injector, factory);
          this.sources.update((all) => ({ ...all, [app.id]: source }));
        });
      }
    });
  }

  /** The open app's screen knows best (it resets its tools on switching); other apps use their stored maps. */
  protected sourceOf(app: SuiteApp): MapSource | null {
    const config = this.panelTabs.config();
    if (config && config.appId === app.id && app.id === this.tabs.activeId()) {
      return config;
    }
    return this.sources()[app.id] ?? null;
  }

  protected isFolded(app: SuiteApp): boolean {
    return this.folded().includes(app.id);
  }

  protected toggleFolded(app: SuiteApp): void {
    this.folded.update((ids) =>
      ids.includes(app.id) ? ids.filter((id) => id !== app.id) : [...ids, app.id],
    );
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify(this.folded()));
    } catch {
      // The choice just won't survive a reload.
    }
  }

  protected openMap(app: SuiteApp, source: MapSource, tab: PanelTab): void {
    if (app.id === this.tabs.activeId() && source === this.panelTabs.config()) {
      this.panelTabs.open(tab.id);
      return;
    }
    // Picks the map, then opens the app on its plain route so it shows that map.
    source.select(tab.id);
    if (app.route) void this.router.navigateByUrl(app.route);
  }
}
