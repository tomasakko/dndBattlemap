import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { BattlemapService } from '../battlemap/services/battlemap.service';
import { WorldmapService } from './worldmap.service';

export const WORLDMAP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Worldmap',
    resolve: {
      worldmapReady: () =>
        Promise.all([
          inject(WorldmapService).ensureRestored(),
          inject(BattlemapService).ensureRestored(),
        ]),
    },
    loadComponent: () => import('./worldmap-screen/worldmap-screen').then((m) => m.WorldmapScreen),
  },
  {
    path: 'player',
    title: 'Worldmap',
    data: { standalone: true },
    loadComponent: () =>
      import('./player-screen/player-screen').then((m) => m.WorldmapPlayerScreen),
  },
];
