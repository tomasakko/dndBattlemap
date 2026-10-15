import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SUITE_APPS, SuiteApp } from './suite-apps';

export interface AppTab {
  readonly app: SuiteApp;
  /** Last visited URL inside the app, restored when the tab is reactivated. */
  readonly url: string;
}

function appRoot(app: SuiteApp): string {
  return app.route ?? '';
}

const STORAGE_KEY = 'dnd-suite-tabs';

interface StoredTab {
  id: string;
  url: string;
}

function readStoredTabs(): AppTab[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const tabs: AppTab[] = [];
    for (const item of stored as Partial<StoredTab>[]) {
      const app = SUITE_APPS.find((a) => a.id === item?.id);
      if (app?.route && typeof item.url === 'string' && !tabs.some((t) => t.app.id === app.id)) {
        tabs.push({ app, url: item.url });
      }
    }
    return tabs;
  } catch {
    return [];
  }
}

/** Open app tabs. Tabs follow navigation: visiting an app's route opens (or refreshes) its tab. They survive page reloads. */
@Injectable({ providedIn: 'root' })
export class TabService {
  private readonly router = inject(Router);
  private readonly _tabs = signal<readonly AppTab[]>(readStoredTabs());
  private readonly _url = signal(this.router.url);

  readonly tabs = this._tabs.asReadonly();
  readonly activeId = computed(() => this.appFor(this._url())?.id ?? null);
  /** True for routes marked `data: { standalone: true }`, which render without the topbar. */
  readonly standalone = signal(false);

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.map((t) => ({ id: t.app.id, url: t.url }))));
    } catch {
      // Tabs just won't survive a reload.
    }
  }

  private appFor(url: string): SuiteApp | undefined {
    const path = url.split(/[?#]/)[0];
    return SUITE_APPS.find((a) => {
      const root = appRoot(a);
      return root && (path === root || path.startsWith(root + '/'));
    });
  }
}
