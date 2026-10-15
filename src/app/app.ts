import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Topbar } from './suite/topbar/topbar';
import { TabService } from './suite/tab.service';

@Component({
  imports: [RouterOutlet, Topbar],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs = inject(TabService);
}
