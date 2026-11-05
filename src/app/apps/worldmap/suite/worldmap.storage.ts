import { inject } from '@angular/core';
import { fromSaved, toEnvelope } from '../../../shared/storage/persisted-state';
import type { AppStorage } from '../../../suite/app-storage';
import { EMPTY_WORLDMAP } from '../domain/model';
import { WORLDMAP_SCHEMA } from '../domain/schema';
import { WorldmapStore } from '../state/worldmap.store';

/** Worldmap data in project files, in the same versioned format as the browser copy. */
export const worldmapStorage: AppStorage = {
  async export() {
    return toEnvelope(WORLDMAP_SCHEMA, await inject(WorldmapStore).exportState());
  },

  async summary() {
    const { maps } = await inject(WorldmapStore).exportState();
    const markers = maps.reduce((total, entry) => total + entry.markers.length, 0);
    return [
      { count: maps.length, label: maps.length === 1 ? 'map' : 'maps' },
      { count: markers, label: markers === 1 ? 'marker' : 'markers' },
    ].filter((item) => item.count > 0);
  },

  async clear() {
    const store = inject(WorldmapStore);
    await store.ensureRestored();
    store.replace(EMPTY_WORLDMAP);
  },

  async import(data) {
    const store = inject(WorldmapStore);
    const state = fromSaved(WORLDMAP_SCHEMA, data);
    await store.ensureRestored();
    store.replace(state);
  },
};
