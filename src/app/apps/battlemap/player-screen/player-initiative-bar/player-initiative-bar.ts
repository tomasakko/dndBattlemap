import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';

export interface PlayerTurn {
  id: string;
  name: string;
  image?: string;
  player: boolean;
  active: boolean;
  down: boolean;
}

@Component({
  selector: 'app-player-initiative-bar',
  imports: [NgOptimizedImage],
  templateUrl: './player-initiative-bar.html',
  styleUrl: './player-initiative-bar.css',
})
export class PlayerInitiativeBar {
  readonly turns = input.required<PlayerTurn[]>();
}
