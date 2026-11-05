import { computed, inject } from '@angular/core';
import type { SearchItem, SearchSource } from '../../../suite/search/search-item';
import { BattlemapStore } from '../state/battlemap.store';

const LOCKED_NOTE = 'End combat to switch maps.';

/** Battlemaps and the NPCs/enemies in their initiative order (player characters are left out). */
export function battlemapSearch(): SearchSource {
  const store = inject(BattlemapStore);
  void store.ensureRestored();
  return {
    items: computed(() => {
      const currentId = store.currentId();
      const locked = store.locked();
      return store.maps().flatMap((entry): SearchItem[] => {
        const disabledNote = locked && entry.id !== currentId ? LOCKED_NOTE : undefined;
        const open = (): void => void store.selectMap(entry.id);
        return [
          {
            id: 'battlemap:' + entry.id,
            kind: 'map',
            label: entry.name,
            icon: 'map',
            mapKind: 'battlemap',
            route: '/battlemap',
            disabledNote,
            open,
          },
          ...entry.initiative.combatants
            .filter((combatant) => combatant.side !== 'player' && !combatant.playerId)
            .map(
              (combatant): SearchItem => ({
                id: 'battlemap-creature:' + entry.id + ':' + combatant.id,
                kind: 'entry',
                label: combatant.name,
                icon: 'swords',
                context: entry.name,
                route: '/battlemap',
                disabledNote,
                open,
              }),
            ),
        ];
      });
    }),
  };
}
