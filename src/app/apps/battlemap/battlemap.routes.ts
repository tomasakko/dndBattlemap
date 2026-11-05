import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { BattlemapStore } from './state/battlemap.store';

export const BATTLEMAP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dm' },
  {
    path: 'dm',
    title: 'Battlemap – Dungeon Master',
    resolve: { battlemapReady: () => inject(BattlemapStore).ensureRestored() },
    loadComponent: () => import('./dm-screen/dm-screen').then((m) => m.DmScreen),
  },
];
