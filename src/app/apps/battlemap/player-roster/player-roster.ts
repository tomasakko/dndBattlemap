import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BattlemapService } from '../services/battlemap.service';
import { InitiativeService } from '../services/initiative.service';
import type { PlayerPreset } from '../services/battlemap.service';

@Component({
  selector: 'app-player-roster',
  imports: [FormsModule],
  templateUrl: './player-roster.html',
  styleUrl: './player-roster.css',
})
export class PlayerRoster {
  private readonly battlemap = inject(BattlemapService);
  private readonly initiative = inject(InitiativeService);

  protected readonly players = this.battlemap.players;
  protected readonly name = signal('');
  protected readonly initiativeValues = signal<Record<string, string>>({});
  protected readonly error = signal('');

  protected setName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected addPlayer(): void {
    const name = this.name().trim();
    if (!name) {
      this.error.set('Enter a player name.');
      return;
    }
    this.battlemap.addPlayer(name);
    this.name.set('');
    this.error.set('');
  }

  protected setInitiative(playerId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.initiativeValues.update((values) => ({ ...values, [playerId]: value }));
    this.error.set('');
  }

  protected addToInitiative(player: PlayerPreset): void {
    const value = this.initiativeValues()[player.id]?.trim() ?? '';
    const initiative = Number(value);
    if (!value || !Number.isFinite(initiative)) {
      this.error.set(`Enter an initiative score for ${player.name}.`);
      return;
    }
    if (this.isInInitiative(player.id)) {
      return;
    }
    this.initiative.addPlayer(player.id, player.name, Math.round(initiative));
    this.error.set('');
  }

  protected isInInitiative(playerId: string): boolean {
    return this.initiative.combatants().some((combatant) => combatant.playerId === playerId);
  }

  protected removePlayer(playerId: string): void {
    this.battlemap.removePlayer(playerId);
    this.initiativeValues.update((values) => {
      const { [playerId]: _removed, ...remaining } = values;
      return remaining;
    });
    this.error.set('');
  }
}
