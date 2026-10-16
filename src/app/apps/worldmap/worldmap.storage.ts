import { inject } from '@angular/core';
import type { AppStorage } from '../../suite/app-storage';
import { WorldmapService } from './worldmap.service';

export const worldmapStorage: AppStorage = {
  async export() {
    const worldmap = inject(WorldmapService);
    await worldmap.ensureRestored();
    return worldmap.exportState();
  },

  async summary() {
    const worldmap = inject(WorldmapService);
    await worldmap.ensureRestored();
    const { maps } = worldmap.exportState();
    const markers = maps.reduce((total, entry) => total + entry.markers.length, 0);
    return [
      { count: maps.length, label: maps.length === 1 ? 'map' : 'maps' },
      { count: markers, label: markers === 1 ? 'marker' : 'markers' },
    ].filter((item) => item.count > 0);
  },

  async import(data) {
    const worldmap = inject(WorldmapService);
    await worldmap.ensureRestored();
    worldmap.importState(data);
  },
};
