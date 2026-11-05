import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { booleanPref } from './shared/storage/local-pref';
import { ConfirmDialog } from './shared/ui/confirm-dialog/confirm-dialog';
import { AppNav } from './suite/shell/app-nav';
import { HelpDialog } from './suite/shell/help-dialog';
import { PanelTabs } from './suite/shell/panel-tabs';
import { PanelTabsService } from './suite/shell/panel-tabs.service';
import { SearchBar } from './suite/search/search-bar';
import { ProjectMenu } from './suite/shell/project-menu';
import { ThemeMenu } from './suite/shell/theme-menu';
import { TabService } from './suite/tab.service';

const collapsedPref = booleanPref('dnd-suite-sidebar-collapsed', false);

@Component({
  imports: [RouterOutlet, ConfirmDialog, AppNav, HelpDialog, PanelTabs, ProjectMenu, SearchBar, ThemeMenu],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs = inject(TabService);
  protected readonly panelTabs = inject(PanelTabsService);
  protected readonly collapsed = signal(collapsedPref.read());
  /** Top-right icons from the design. Only Help works so far; uncomment the others once their features exist. */
  protected readonly userBar = [
    // { icon: 'notifications', label: 'Notifications' },
    { icon: 'help', label: 'Help' },
    // { icon: 'settings', label: 'Settings' },
    // { icon: 'account_circle', label: 'Account' },
  ];
  protected readonly helpOpen = signal(false);

  protected toggleSidebar(): void {
    this.collapsed.update((collapsed) => !collapsed);
    collapsedPref.write(this.collapsed());
  }
}
