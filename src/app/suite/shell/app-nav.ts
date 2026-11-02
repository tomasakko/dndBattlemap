import { Component, computed, inject, input } from '@angular/core';
import { SUITE_APPS, SuiteApp } from '../suite-apps';
import { TabService } from '../tab.service';
import { PanelTab, PanelTabsService } from './panel-tabs.service';

/** Sidebar list of the suite's apps; the active app also lists its maps. */
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
  protected readonly locked = computed(() => this.panelTabs.config()?.locked?.() ?? false);

  /** The maps to list under an app: only the active app's, and only once it has some. */
  protected mapsOf(app: SuiteApp): PanelTab[] {
    const config = this.panelTabs.config();
    return config && config.appId === app.id && app.id === this.tabs.activeId() ? config.tabs() : [];
  }

  protected remove(tab: PanelTab): void {
    this.panelTabs.config()?.remove(tab);
  }
}
