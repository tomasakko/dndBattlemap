import { Component, OnInit, computed, inject } from '@angular/core';
import { ProjectService } from './project.service';
import { SUITE_APPS } from './suite-apps';
import { TabService } from './tab.service';

/** Start page inside the main panel: what the open project contains. */
@Component({
  selector: 'app-portal',
  templateUrl: './portal.html',
  styleUrl: './portal.css',
})
export class Portal implements OnInit {
  protected readonly project = inject(ProjectService);
  protected readonly tabs = inject(TabService);

  /** Apps that hold data in this project, with their counts. */
  protected readonly contents = computed(() => {
    const summaries = this.project.summaries();
    return SUITE_APPS.flatMap((app) => {
      const items = (summaries[app.id] ?? []).filter((item) => item.count > 0);
      return app.route && items.length > 0 ? [{ app, items }] : [];
    });
  });

  ngOnInit(): void {
    void this.project.refreshSummaries();
  }
}
