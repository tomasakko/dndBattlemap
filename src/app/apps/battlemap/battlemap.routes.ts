import { Routes } from '@angular/router';

export const BATTLEMAP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dm' },
  {
    path: 'dm',
    title: 'Battlemap – Dungeon Master',
    loadComponent: () => import('./dm-screen/dm-screen').then((m) => m.DmScreen),
  },
  {
    path: 'player',
    title: 'Battlemap',
    data: { standalone: true },
    loadComponent: () => import('./player-screen/player-screen').then((m) => m.PlayerScreen),
  },
];
