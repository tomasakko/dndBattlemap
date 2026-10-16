import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Topbar } from './suite/topbar/topbar';
import { ConfirmDialog } from './shared/ui/confirm-dialog/confirm-dialog';
import { TabService } from './suite/tab.service';

@Component({
  imports: [RouterOutlet, Topbar, ConfirmDialog],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs = inject(TabService);
}
