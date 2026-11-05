import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './shared/ui/confirm-dialog/confirm-dialog';
import { AppNav } from './suite/shell/app-nav';
import { HelpDialog } from './suite/shell/help-dialog';
import { PanelTabs } from './suite/shell/panel-tabs';
import { PanelTabsService } from './suite/shell/panel-tabs.service';
import { SearchBar } from './suite/search/search-bar';
import { ProjectMenu } from './suite/shell/project-menu';
import { ThemeMenu } from './suite/shell/theme-menu';
import { TabService } from './suite/tab.service';
import { PlayerLoadingScreen } from './suite/player-loading';
import { PlayerWindowService } from './suite/player-window.service';

const COLLAPSED_KEY = 'dnd-suite-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Component({
  imports: [RouterOutlet, ConfirmDialog, AppNav, HelpDialog, PanelTabs, PlayerLoadingScreen, ProjectMenu, SearchBar, ThemeMenu],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs = inject(TabService);
  protected readonly panelTabs = inject(PanelTabsService);
  protected readonly collapsed = signal(readCollapsed());
  /** Top-right icons from the design. Only Help works so far; uncomment the others once their features exist. */
  protected readonly userBar = [
    // { icon: 'notifications', label: 'Notifications' },
    { icon: 'help', label: 'Help' },
    // { icon: 'settings', label: 'Settings' },
    // { icon: 'account_circle', label: 'Account' },
  ];
  protected readonly helpOpen = signal(false);
  protected readonly playerWindow = inject(PlayerWindowService);

  constructor() {
    // Player screens (standalone routes) follow the DM when the eye button switches apps.
    effect(() => {
      if (this.tabs.standalone() && typeof window !== 'undefined') {
        this.playerWindow.listen();
      }
    });
  }

  protected toggleSidebar(): void {
    this.collapsed.update((collapsed) => !collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      // The sidebar just won't remember its state.
    }
  }
}
