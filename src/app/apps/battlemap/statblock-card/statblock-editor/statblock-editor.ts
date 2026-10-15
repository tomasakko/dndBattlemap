import { Component, input, output } from '@angular/core';
import { ABILITIES, MOVEMENTS } from '../../models/statblock';
import type { Ability, Movement, Statblock } from '../../models/statblock';
import { StatblockEntries } from '../statblock-entries/statblock-entries';
import type { EntryChange } from '../statblock-entries/statblock-entries';

export type EntryKey = 'traits' | 'actions';
export interface StatblockSection {
  key: EntryKey;
  title: string;
}

type TextKey =
  | 'name'
  | 'size'
  | 'type'
  | 'alignment'
  | 'armorNote'
  | 'hitDice'
  | 'skills'
  | 'senses'
  | 'languages';
type NumberKey = 'armorClass' | 'hitPoints';

@Component({
  selector: 'app-statblock-editor',
  imports: [StatblockEntries],
  templateUrl: './statblock-editor.html',
  styleUrl: './statblock-editor.css',
})
export class StatblockEditor {
  readonly stats = input.required<Statblock>();
  readonly sections = input.required<StatblockSection[]>();
  readonly textChanged = output<{ key: TextKey; value: string }>();
  readonly numberChanged = output<{ key: NumberKey; value: string }>();
  readonly speedChanged = output<{ movement: Movement; value: string }>();
  readonly abilityChanged = output<{ ability: Ability; value: string }>();
  readonly entryChanged = output<{ key: EntryKey; change: EntryChange }>();
  readonly entryAdded = output<EntryKey>();
  readonly entryRemoved = output<{ key: EntryKey; index: number }>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly abilities = ABILITIES;
  protected readonly movements = MOVEMENTS;

  protected movementLabel(movement: Movement): string {
    return movement === 'walk' ? 'Speed' : movement[0].toUpperCase() + movement.slice(1);
  }

  protected emitText(key: TextKey, event: Event): void {
    this.textChanged.emit({ key, value: (event.target as HTMLInputElement).value });
  }

  protected emitNumber(key: NumberKey, event: Event): void {
    this.numberChanged.emit({ key, value: (event.target as HTMLInputElement).value });
  }

  protected emitSpeed(movement: Movement, event: Event): void {
    this.speedChanged.emit({ movement, value: (event.target as HTMLInputElement).value });
  }

  protected emitAbility(ability: Ability, event: Event): void {
    this.abilityChanged.emit({ ability, value: (event.target as HTMLInputElement).value });
  }

  protected updateEntry(key: EntryKey, change: EntryChange): void {
    this.entryChanged.emit({ key, change });
  }
}
