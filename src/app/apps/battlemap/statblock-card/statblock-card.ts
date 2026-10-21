import { Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { CreatureService } from '../../../shared/creatures/creature.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { InitiativeService } from '../services/initiative.service';
import type { Combatant } from '../services/initiative.service';
import type { Ability, Movement, Statblock } from '../../../shared/creatures/statblock';
import type { EntryChange } from './statblock-entries/statblock-entries';
import { StatblockDetails } from './statblock-details/statblock-details';
import { StatblockEditor } from './statblock-editor/statblock-editor';
import type { EntryKey, StatblockSection } from './statblock-editor/statblock-editor';

type TextKey = 'name' | 'size' | 'type' | 'alignment' | 'armorNote' | 'hitDice' | 'skills' | 'senses' | 'languages';
type NumberKey = 'armorClass' | 'hitPoints';

@Component({
  selector: 'app-statblock-card',
  imports: [StatblockDetails, StatblockEditor],
  templateUrl: './statblock-card.html',
  styleUrl: './statblock-card.css',
  host: {
    '(window:keydown.escape)': 'closed.emit()',
  },
})
export class StatblockCard {
  private readonly initiative = inject(InitiativeService);
  private readonly creatures = inject(CreatureService);
  private readonly confirm = inject(ConfirmService);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('close');

  readonly combatant = input.required<Combatant>();
  readonly closed = output<void>();

  protected readonly sections: StatblockSection[] = [
    { key: 'traits', title: 'Traits' },
    { key: 'actions', title: 'Actions' },
  ];
  protected readonly editing = signal(false);
  protected readonly draft = signal<Statblock | null>(null);

  private readonly defaults = computed(() => this.creatures.findById(this.combatant().type)?.statblock);
  protected readonly customised = computed(() => !!this.combatant().stats);
  /** What is shown: the draft while editing, otherwise the DM's edited copy or the type's default. */
  protected readonly sizeAndType = computed(() => [this.stats()?.size, this.stats()?.type].filter(Boolean).join(' '));
  protected readonly stats = computed(() => this.draft() ?? this.combatant().stats ?? this.defaults() ?? null);

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  protected backdropClick(event: MouseEvent): void {
    if (!this.editing() && event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected startEdit(): void {
    const current = this.stats();
    if (current) {
      this.draft.set(structuredClone(current));
      this.editing.set(true);
    }
  }

  protected save(): void {
    const draft = this.draft();
    if (draft) {
      this.initiative.setStats(this.combatant().id, draft);
    }
    this.stopEditing();
  }

  protected stopEditing(): void {
    this.draft.set(null);
    this.editing.set(false);
  }

  protected async resetToDefault(): Promise<void> {
    if (await this.confirm.ask('Discard your changes and use the standard stats for this creature?', 'Discard')) {
      this.initiative.setStats(this.combatant().id, undefined);
      this.stopEditing();
    }
  }

  protected setText(key: TextKey, value: string): void {
    this.draft.update((d) => d && { ...d, [key]: value });
  }

  protected setNumber(key: NumberKey, value: string): void {
    this.draft.update((d) => d && { ...d, [key]: Number(value) || 0 });
  }

  protected setSpeed(movement: Movement, value: string): void {
    this.draft.update((d) => d && { ...d, speed: { ...d.speed, [movement]: value } });
  }

  protected setAbility(ability: Ability, value: string): void {
    this.draft.update((d) => d && { ...d, abilities: { ...d.abilities, [ability]: Number(value) || 0 } });
  }

  protected setEntry(key: EntryKey, change: EntryChange): void {
    this.draft.update(
      (d) =>
        d &&
        {
          ...d,
          [key]: d[key].map((entry, index) =>
            index === change.index ? { ...entry, [change.field]: change.value } : entry,
          ),
        },
    );
  }

  protected addEntry(key: EntryKey): void {
    this.draft.update((d) => d && { ...d, [key]: [...d[key], { name: '', description: '' }] });
  }

  protected removeEntry(key: EntryKey, index: number): void {
    this.draft.update((d) => d && { ...d, [key]: d[key].filter((_, i) => i !== index) });
  }
}
