import { RenderMode, ServerRoute } from '@angular/ssr';

// The app relies on browser-only APIs (BroadcastChannel, FileReader, localStorage).
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
