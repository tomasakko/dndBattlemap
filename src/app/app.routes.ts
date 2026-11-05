import { Routes } from '@angular/router';

export const routes: Routes = [
  // There's no separate start page: the suite opens on the first app.
  { path: '', pathMatch: 'full', redirectTo: 'worldmap' },
  // The player window. It follows the DM's stage, so one URL serves every app.
  {
    path: 'player',
    title: 'Player screen',
    data: { standalone: true },
    loadComponent: () => import('./suite/presentation/player-shell').then((m) => m.PlayerShell),
  },
  // Player URLs from before the shared player screen, and from before the suite existed.
  { path: 'battlemap/player', redirectTo: 'player' },
  { path: 'worldmap/player', redirectTo: 'player' },
  { path: 'dm', redirectTo: 'battlemap/dm' },
  {
    path: 'battlemap',
    loadChildren: () => import('./apps/battlemap/battlemap.routes').then((m) => m.BATTLEMAP_ROUTES),
  },
  {
    path: 'worldmap',
    loadChildren: () => import('./apps/worldmap/worldmap.routes').then((m) => m.WORLDMAP_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
