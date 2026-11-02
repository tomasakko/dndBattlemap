import { Routes } from '@angular/router';

export const routes: Routes = [
  // There's no separate start page: the suite opens on the first app.
  { path: '', pathMatch: 'full', redirectTo: 'worldmap' },
  {
    path: 'battlemap',
    loadChildren: () => import('./apps/battlemap/battlemap.routes').then((m) => m.BATTLEMAP_ROUTES),
  },
  {
    path: 'worldmap',
    loadChildren: () => import('./apps/worldmap/worldmap.routes').then((m) => m.WORLDMAP_ROUTES),
  },
  // Legacy URLs from before the suite existed.
  { path: 'dm', redirectTo: 'battlemap/dm' },
  { path: 'player', redirectTo: 'battlemap/player' },
  { path: '**', redirectTo: '' },
];
