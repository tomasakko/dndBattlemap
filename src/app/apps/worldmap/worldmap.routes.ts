import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { WorldmapStore } from './state/worldmap.store';

export const WORLDMAP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Worldmap',
    resolve: { worldmapReady: () => inject(WorldmapStore).ensureRestored() },
    loadComponent: () => import('./worldmap-screen/worldmap-screen').then((m) => m.WorldmapScreen),
  },
];
