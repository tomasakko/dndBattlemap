import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './shared/ui/confirm-dialog/confirm-dialog';
import { AppNav } from './suite/shell/app-nav';
import { PanelTabs } from './suite/shell/panel-tabs';
import { PanelTabsService } from './suite/shell/panel-tabs.service';
import { ProjectMenu } from './suite/shell/project-menu';
import { TabService } from './suite/tab.service';

const COLLAPSED_KEY = 'dnd-suite-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Component({
  imports: [RouterOutlet, ConfirmDialog, AppNav, PanelTabs, ProjectMenu],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs = inject(TabService);
  protected readonly panelTabs = inject(PanelTabsService);
  protected readonly collapsed = signal(readCollapsed());
  /** Top-right icons from the design; the features behind them don't exist yet. */
  protected readonly userBar = [
    { icon: 'notifications', label: 'Notifications' },
    { icon: 'help', label: 'Help' },
    { icon: 'settings', label: 'Settings' },
    { icon: 'account_circle', label: 'Account' },
  ];

  protected toggleSidebar(): void {
    this.collapsed.update((collapsed) => !collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      // The sidebar just won't remember its state.
    }
  }
}
