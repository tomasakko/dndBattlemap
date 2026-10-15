import { Component, input, output } from '@angular/core';
import { ABILITIES, MOVEMENTS, abilityModifier } from '../../../../shared/creatures/statblock';
import type { Movement, Statblock } from '../../../../shared/creatures/statblock';
import { StatblockEntries } from '../statblock-entries/statblock-entries';
import type { StatblockSection } from '../statblock-editor/statblock-editor';

@Component({
  selector: 'app-statblock-details',
  imports: [StatblockEntries],
  templateUrl: './statblock-details.html',
  styleUrl: './statblock-details.css',
})
export class StatblockDetails {
  readonly stats = input.required<Statblock>();
  readonly sections = input.required<StatblockSection[]>();
  readonly customised = input(false);
  readonly edit = output<void>();
  readonly reset = output<void>();

  protected readonly abilities = ABILITIES;

  protected modifier(score: number): string {
    return abilityModifier(score);
  }

  protected speeds(): { label: string; value: string }[] {
    const stats = this.stats();
    return MOVEMENTS.filter((movement) => stats.speed[movement]).map((movement) => ({
      label: this.movementLabel(movement),
      value: stats.speed[movement],
    }));
  }

  private movementLabel(movement: Movement): string {
    return movement === 'walk' ? 'Speed' : movement[0].toUpperCase() + movement.slice(1);
  }
}
