import { inject } from '@angular/core';
import { WorldmapHost } from '../sync/worldmap.host';

/** Starts publishing the world map to the player screen (see `PlayerPresenter.loadHost`). */
export function startWorldmapHost(): void {
  inject(WorldmapHost);
}
