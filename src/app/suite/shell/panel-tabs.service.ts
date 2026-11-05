import { DestroyRef, Service, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { localPref } from '../../shared/storage/local-pref';

export interface PanelTab {
  readonly id: string;
  readonly label: string;
  /** Extra info shown as a tooltip, e.g. that the map is shown to players. */
  readonly note?: string;
}

/** An app's maps as the sidebar lists them. */
export interface MapSource {
  readonly ariaLabel: string;
  /** Every map of the app, in sidebar order. */
  readonly tabs: Signal<PanelTab[]>;
  readonly currentId: Signal<string | null>;
  /** Prefix for the delete button's accessible name, e.g. "Delete map ". */
  readonly removeLabel: string;
  /** When true, only the current map can be used and nothing can be deleted. */
  readonly locked?: Signal<boolean>;
  readonly lockedNote?: string;
  /** Opens the map in its app. Returns false when it can't be opened right now (see `locked`). */
  select(id: string): boolean;
  /** Deletes the map (asking for confirmation first). */
  remove(tab: PanelTab): void;
}

/** What an app screen puts into the shell: its maps (sidebar list) and the open ones (tabs). */
export interface PanelTabsConfig extends MapSource {
  /** Suite app id, so the sidebar knows which app the maps belong to. */
  readonly appId: string;
}

const openPref = localPref<Record<string, string[]>>('dnd-suite-open-maps', {}, {
  parse: (raw) => {
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(stored).map(([app, ids]) => [
        app,
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
      ]),
    );
  },
});

/**
 * Lets the active app screen fill the shell's sidebar map list and tab strip.
 * Tabs are the maps the DM has open; closing a tab keeps the map, deleting happens from the sidebar.
 */
@Service()
export class PanelTabsService {
  readonly config = signal<PanelTabsConfig | null>(null);
  private readonly openIds = signal<Record<string, string[]>>(openPref.read());

  /** Open maps of the active app, in the order they were opened. */
  readonly openTabs = computed<PanelTab[]>(() => {
    const config = this.config();
    if (!config) return [];
    const maps = config.tabs();
    return (this.openIds()[config.appId] ?? [])
      .map((id) => maps.find((tab) => tab.id === id))
      .filter((tab): tab is PanelTab => !!tab);
  });

  /** The app has maps, but all its tabs are closed: the panel asks to open one from the sidebar. */
  readonly nothingOpen = computed(() => {
    const config = this.config();
    return !!config && config.tabs().length > 0 && this.openTabs().length === 0;
  });

  constructor() {
    // Whatever map the app shows is open; switching maps from anywhere opens its tab.
    effect(() => {
      const config = this.config();
      const id = config?.currentId();
      if (config && id) {
        untracked(() => this.markOpen(config.appId, id));
      }
    });
  }

  /** Shows the maps for as long as the calling component lives. Call from a constructor. */
  register(config: PanelTabsConfig): void {
    this.config.set(config);
    inject(DestroyRef).onDestroy(() => {
      if (this.config() === config) {
        this.config.set(null);
      }
    });
  }

  open(id: string): void {
    const config = this.config();
    if (!config) return;
    this.markOpen(config.appId, id);
    config.select(id);
  }

  /** Closes a tab without deleting the map. The neighbouring tab becomes active. */
  close(tab: PanelTab): void {
    const config = this.config();
    if (!config) return;
    const open = this.openTabs();
    const index = open.findIndex((t) => t.id === tab.id);
    this.setOpen(config.appId, (this.openIds()[config.appId] ?? []).filter((id) => id !== tab.id));
    if (tab.id === config.currentId()) {
      const next = open[index + 1] ?? open[index - 1];
      if (next) config.select(next.id);
    }
  }

  private markOpen(appId: string, id: string): void {
    const ids = this.openIds()[appId] ?? [];
    if (!ids.includes(id)) {
      this.setOpen(appId, [...ids, id]);
    }
  }

  private setOpen(appId: string, ids: string[]): void {
    this.openIds.update((all) => ({ ...all, [appId]: ids }));
    openPref.write(this.openIds());
  }
}
