import { computed, inject } from '@angular/core';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import type { MapSource } from '../../suite/shell/panel-tabs.service';
import { BattlemapService } from './services/battlemap.service';

/** The battlemaps for the sidebar while the Battlemap app isn't open. */
export function battlemapMaps(): MapSource {
  const battlemap = inject(BattlemapService);
  const confirm = inject(ConfirmService);
  void battlemap.ensureRestored();
  return {
    ariaLabel: 'Battlemaps',
    removeLabel: 'Delete map ',
    tabs: computed(() =>
      battlemap.maps().map((entry) => ({
        id: entry.id,
        label: entry.name,
        ...(entry.id === battlemap.sharedId() ? { note: 'shown to players' } : {}),
      })),
    ),
    currentId: battlemap.currentId,
    locked: battlemap.locked,
    lockedNote: 'End combat to switch maps.',
    select: (id) => battlemap.selectMap(id),
    remove: async (tab) => {
      if (await confirm.ask('Remove the map "' + tab.label + '" and its shapes?')) {
        battlemap.removeMap(tab.id);
      }
    },
  };
}
