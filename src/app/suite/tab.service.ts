import { DOCUMENT } from '@angular/common';
import { Service, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { localPref } from '../shared/storage/local-pref';
import { PLAYER_PATH } from './presentation/stage';
import { SUITE_APPS, SuiteApp } from './suite-apps';

export interface AppTab {
  readonly app: SuiteApp;
  /** Last visited URL inside the app, restored when the tab is reactivated. */
  readonly url: string;
}

function appRoot(app: SuiteApp): string {
  return app.route ?? '';
}

interface StoredTab {
  id: string;
  url: string;
}

const tabsPref = localPref<AppTab[]>('dnd-suite-tabs', [], {
  parse: (raw) => {
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return undefined;
    const tabs: AppTab[] = [];
    for (const item of stored as Partial<StoredTab>[]) {
      const app = SUITE_APPS.find((a) => a.id === item?.id);
      if (app?.route && typeof item.url === 'string' && !tabs.some((t) => t.app.id === app.id)) {
        tabs.push({ app, url: item.url });
      }
    }
    return tabs;
  },
  serialise: (tabs) => JSON.stringify(tabs.map((t): StoredTab => ({ id: t.app.id, url: t.url }))),
});

/** Open app tabs. Tabs follow navigation: visiting an app's route opens (or refreshes) its tab. They survive page reloads. */
@Service()
export class TabService {
  private readonly router = inject(Router);
  private readonly _tabs = signal<readonly AppTab[]>(tabsPref.read());
  private readonly _url = signal(this.router.url);

  readonly tabs = this._tabs.asReadonly();
  readonly activeId = computed(() => this.appFor(this._url())?.id ?? null);
  /**
   * True for routes marked `data: { standalone: true }` (the player window), which render without the
   * DM's chrome. Known from the address before the first navigation ends, so the player window never
   * briefly builds the DM's sidebar.
   */
  readonly standalone = signal(isPlayerPath(inject(DOCUMENT).location?.pathname ?? ''));

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      const url = e.urlAfterRedirects;
      this._url.set(url);
      let route = this.router.routerState.snapshot.root;
      let standalone = false;
      while (route) {
        standalone ||= route.data['standalone'] === true;
        route = route.firstChild as typeof route;
      }
      this.standalone.set(standalone);
      const app = this.appFor(url);
      // Standalone screens (e.g. the player view) live in their own browser window and aren't tabs.
      if (!app || standalone) return;
      this.setTabs(
        this._tabs().some((t) => t.app.id === app.id)
          ? this._tabs().map((t) => (t.app.id === app.id ? { ...t, url } : t))
          : [...this._tabs(), { app, url }],
      );
    });
  }

  /** Goes to the app, back to where it was last left if it has been visited. */
  open(app: SuiteApp): void {
    const tab = this._tabs().find((t) => t.app.id === app.id);
    const url = tab?.url ?? app.route;
    if (url) void this.router.navigateByUrl(url);
  }

  activate(tab: AppTab): void {
    void this.router.navigateByUrl(tab.url);
  }

  close(tab: AppTab): void {
    const tabs = this._tabs();
    const index = tabs.findIndex((t) => t.app.id === tab.app.id);
    if (index < 0) return;
    const remaining = tabs.filter((t) => t.app.id !== tab.app.id);
    this.setTabs(remaining);
    if (this.activeId() === tab.app.id) {
      const next = remaining[index] ?? remaining[index - 1];
      void this.router.navigateByUrl(next ? next.url : '/');
    }
  }

  private setTabs(tabs: readonly AppTab[]): void {
    this._tabs.set(tabs);
    tabsPref.write([...tabs]);
  }

  private appFor(url: string): SuiteApp | undefined {
    const path = url.split(/[?#]/)[0];
    return SUITE_APPS.find((a) => {
      const root = appRoot(a);
      return root && (path === root || path.startsWith(root + '/'));
    });
  }
}

function isPlayerPath(path: string): boolean {
  return ['', '/battlemap', '/worldmap'].some((prefix) => path === prefix + PLAYER_PATH);
}
