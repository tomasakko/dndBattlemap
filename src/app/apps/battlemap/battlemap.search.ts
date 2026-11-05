import { computed, inject } from '@angular/core';
import type { SearchItem, SearchSource } from '../../suite/search/search-item';
import { BattlemapService } from './services/battlemap.service';
import { InitiativeService } from './services/initiative.service';

const LOCKED_NOTE = 'End combat to switch maps.';

/** Battlemaps and the NPCs/enemies in their initiative order (player characters are left out). */
export function battlemapSearch(): SearchSource {
  const battlemap = inject(BattlemapService);
  const initiative = inject(InitiativeService);
  void battlemap.ensureRestored();
  return {
    items: computed(() => {
      const currentId = battlemap.currentId();
      const locked = battlemap.locked();
      return battlemap.maps().flatMap((entry): SearchItem[] => {
        const isCurrent = entry.id === currentId;
        const disabledNote = locked && !isCurrent ? LOCKED_NOTE : undefined;
        // The open map's initiative is live in the initiative service; the others are stored on their entry.
        const combatants = isCurrent
          ? initiative.combatants()
          : (entry.initiative?.combatants ?? []);
        return [
          {
            id: 'battlemap:' + entry.id,
            kind: 'map',
            label: entry.name,
            icon: 'map',
            mapKind: 'battlemap',
            route: '/battlemap',
            disabledNote,
            open: () => battlemap.selectMap(entry.id),
          },
          ...combatants
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
                open: () => battlemap.selectMap(entry.id),
              }),
            ),
        ];
      });
    }),
  };
}
