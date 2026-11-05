import { computed, inject } from '@angular/core';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import type { MapSource } from '../../../suite/shell/panel-tabs.service';
import { WorldmapStore } from '../state/worldmap.store';

/**
 * The world maps as the sidebar and the tab strip see them.
 * `onSwitch` runs before the open map changes, so an open Worldmap screen can put its tools away.
 */
export function worldmapMaps(onSwitch?: () => void): MapSource {
  const store = inject(WorldmapStore);
  const confirm = inject(ConfirmService);
  void store.ensureRestored();
  return {
    ariaLabel: 'World maps',
    removeLabel: 'Delete map ',
    tabs: computed(() => store.maps().map((entry) => ({ id: entry.id, label: entry.name }))),
    currentId: store.currentId,
    select: (id) => {
      if (id !== store.currentId()) {
        onSwitch?.();
      }
      return store.selectMap(id);
    },
    remove: async (tab) => {
      if (await confirm.ask('Remove the map "' + tab.label + '" and its markers?')) {
        onSwitch?.();
        store.removeMap(tab.id);
      }
    },
  };
}
