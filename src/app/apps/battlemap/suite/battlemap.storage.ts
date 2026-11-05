import { inject } from '@angular/core';
import { fromSaved, toEnvelope } from '../../../shared/storage/persisted-state';
import type { AppStorage } from '../../../suite/app-storage';
import { EMPTY_BATTLEMAP } from '../domain/model';
import { BATTLEMAP_SCHEMA } from '../domain/schema';
import { BattlemapStore } from '../state/battlemap.store';

/** Battlemap data in project files, in the same versioned format as the browser copy. */
export const battlemapStorage: AppStorage = {
  async export() {
    return toEnvelope(BATTLEMAP_SCHEMA, await inject(BattlemapStore).exportState());
  },

  async summary() {
    const { maps } = await inject(BattlemapStore).exportState();
    const combats = maps.filter((map) => map.initiative.combatants.length > 0).length;
    return [
      { count: maps.length, label: maps.length === 1 ? 'map' : 'maps' },
      { count: combats, label: combats === 1 ? 'combat' : 'combats' },
    ].filter((item) => item.count > 0);
  },

  async clear() {
    const store = inject(BattlemapStore);
    await store.ensureRestored();
    store.replace(EMPTY_BATTLEMAP);
  },

  async import(data) {
    const store = inject(BattlemapStore);
    const state = fromSaved(BATTLEMAP_SCHEMA, data);
    await store.ensureRestored();
    store.replace(state);
  },
};
