import { computed, inject } from '@angular/core';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { PlayerStageService } from '../../../suite/presentation/player-stage.service';
import type { MapSource } from '../../../suite/shell/panel-tabs.service';
import { BattlemapStore } from '../state/battlemap.store';

/**
 * The battlemaps as the sidebar, the tab strip and links from other apps see them.
 * `onSwitch` runs before the open map changes, so an open DM screen can put its tools away.
 */
export function battlemapMaps(onSwitch?: () => void): MapSource {
  const store = inject(BattlemapStore);
  const stage = inject(PlayerStageService);
  const confirm = inject(ConfirmService);
  void store.ensureRestored();
  return {
    ariaLabel: 'Battlemaps',
    removeLabel: 'Delete map ',
    tabs: computed(() =>
      store.maps().map((entry) => ({
        id: entry.id,
        label: entry.name,
        ...(stage.isShowing('battlemap', entry.id) ? { note: 'shown to players' } : {}),
      })),
    ),
    currentId: store.currentId,
    locked: store.locked,
    lockedNote: 'End combat to switch maps.',
    select: (id) => {
      if (id !== store.currentId()) {
        onSwitch?.();
      }
      return store.selectMap(id);
    },
    remove: async (tab) => {
      if (await confirm.ask('Remove the map "' + tab.label + '" and its shapes?')) {
        onSwitch?.();
        store.removeMap(tab.id);
      }
    },
  };
}
