import { inject } from '@angular/core';
import type { AppStorage } from '../../suite/app-storage';
import { BattlemapService } from './services/battlemap.service';

export const battlemapStorage: AppStorage = {
  async export() {
    const battlemap = inject(BattlemapService);
    await battlemap.ensureRestored();
    return battlemap.exportState();
  },

  async summary() {
    const battlemap = inject(BattlemapService);
    await battlemap.ensureRestored();
    const { maps } = battlemap.exportState();
    const combats = maps.filter((map) => (map.initiative?.combatants.length ?? 0) > 0).length;
    return [
      { count: maps.length, label: 'maps' },
      { count: combats, label: 'combats' },
    ].filter((item) => item.count > 0);
  },

  async import(data) {
    const battlemap = inject(BattlemapService);
    await battlemap.ensureRestored();
    battlemap.importState(data);
  },
};
