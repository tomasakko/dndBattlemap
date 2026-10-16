import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectService } from './project.service';
import { SUITE_APPS } from './suite-apps';

@Component({
  selector: 'app-portal',
  imports: [RouterLink],
  templateUrl: './portal.html',
  styleUrl: './portal.css',
})
export class Portal implements OnInit {
  protected readonly apps = SUITE_APPS;
  protected readonly project = inject(ProjectService);

  ngOnInit(): void {
    void this.project.refreshSummaries();
  }
}
