import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SUITE_APPS } from './suite-apps';

@Component({
  selector: 'app-portal',
  imports: [RouterLink],
  templateUrl: './portal.html',
  styleUrl: './portal.css',
})
export class Portal {
  protected readonly apps = SUITE_APPS;
}
