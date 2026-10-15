import { inject } from '@angular/core';
import type { AppStorage } from '../../suite/app-storage';
import { BattlemapService } from './services/battlemap.service';

export const battlemapStorage: AppStorage = {
  export() {
    const battlemap = inject(BattlemapService);
    battlemap.ensureRestored();
    return battlemap.exportState();
  },

  import(data) {
    const battlemap = inject(BattlemapService);
    battlemap.ensureRestored();
    battlemap.importState(data);
  },
};
