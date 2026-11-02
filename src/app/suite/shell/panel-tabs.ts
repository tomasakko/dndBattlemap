import { Component, computed, inject } from '@angular/core';
import { PanelTabsService } from './panel-tabs.service';

/** Tab strip that sits on the top edge of the main panel. */
@Component({
  selector: 'app-panel-tabs',
  templateUrl: './panel-tabs.html',
  styleUrl: './panel-tabs.css',
})
export class PanelTabs {
  protected readonly panelTabs = inject(PanelTabsService);
  protected readonly locked = computed(() => this.panelTabs.config()?.locked?.() ?? false);
}
