import { Service, inject } from '@angular/core';
import { newId } from '../../../shared/util/id';
import { BattlemapStore } from './battlemap.store';

/** Player characters kept ready to add to any map's initiative order. */
@Service()
export class PlayerRosterService {
  private readonly store = inject(BattlemapStore);

  readonly players = this.store.players;

  add(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('A player name is required');
    }
    this.store.updatePlayers((players) => [...players, { id: newId(), name: trimmed }]);
  }

  remove(id: string): void {
    this.store.updatePlayers((players) => players.filter((player) => player.id !== id));
  }
}
