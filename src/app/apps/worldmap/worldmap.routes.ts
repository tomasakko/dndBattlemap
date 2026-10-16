import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { WorldmapService } from './worldmap.service';

export const WORLDMAP_ROUTES: Routes = [
  {
    path: '',
    title: 'Worldmap',
    resolve: { worldmapReady: () => inject(WorldmapService).ensureRestored() },
    loadComponent: () => import('./worldmap-screen/worldmap-screen').then((m) => m.WorldmapScreen),
  },
];
