import { computed, inject } from '@angular/core';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import type { MapSource } from '../../suite/shell/panel-tabs.service';
import { WorldmapService } from './worldmap.service';

/** The world maps for the sidebar while the Worldmap app isn't open. */
export function worldmapMaps(): MapSource {
  const worldmap = inject(WorldmapService);
  const confirm = inject(ConfirmService);
  void worldmap.ensureRestored();
  return {
    ariaLabel: 'World maps',
    removeLabel: 'Delete map ',
    tabs: computed(() => worldmap.maps().map((entry) => ({ id: entry.id, label: entry.name }))),
    currentId: worldmap.currentId,
    select: (id) => worldmap.selectMap(id),
    remove: async (tab) => {
      if (await confirm.ask('Remove the map "' + tab.label + '" and its markers?')) {
        worldmap.removeMap(tab.id);
      }
    },
  };
}
