import { Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { creatureType } from '../creature-types';
import { Combatant, InitiativeService } from '../initiative.service';
import { ABILITIES, Ability, MOVEMENTS, Movement, StatEntry, Statblock, abilityModifier } from '../statblock';

type TextKey = 'name' | 'size' | 'type' | 'alignment' | 'armorNote' | 'hitDice' | 'skills' | 'senses' | 'languages';
type NumberKey = 'armorClass' | 'hitPoints';
type EntryKey = 'traits' | 'actions';

@Component({
  selector: 'app-statblock-card',
  templateUrl: './statblock-card.html',
  styleUrl: './statblock-card.css',
  host: {
    '(window:keydown.escape)': 'closed.emit()',
  },
})
export class StatblockCard {
  private readonly initiative = inject(InitiativeService);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('close');

  readonly combatant = input.required<Combatant>();
  readonly closed = output<void>();

  protected readonly abilities = ABILITIES;
  protected readonly movements = MOVEMENTS;
  protected readonly sections: { key: EntryKey; title: string }[] = [
    { key: 'traits', title: 'Traits' },
    { key: 'actions', title: 'Actions' },
  ];
  protected readonly editing = signal(false);
  protected readonly draft = signal<Statblock | null>(null);

  private readonly defaults = computed(() => creatureType(this.combatant().type)?.statblock);
  protected readonly customised = computed(() => !!this.combatant().stats);
  /** What is shown: the draft while editing, otherwise the DM's edited copy or the type's default. */
  protected readonly sizeAndType = computed(() => [this.stats()?.size, this.stats()?.type].filter(Boolean).join(' '));
  protected readonly stats = computed(() => this.draft() ?? this.combatant().stats ?? this.defaults() ?? null);

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  protected modifier(score: number): string {
    return abilityModifier(score);
  }

  protected movementLabel(movement: Movement): string {
    return movement === 'walk' ? 'Speed' : movement[0].toUpperCase() + movement.slice(1);
  }

  protected speeds(stats: Statblock): { label: string; value: string }[] {
    return MOVEMENTS.filter((m) => stats.speed[m]).map((m) => ({ label: this.movementLabel(m), value: stats.speed[m] }));
  }

  protected backdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
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

  protected resetToDefault(): void {
    if (confirm('Discard your changes and use the standard stats for this creature?')) {
      this.initiative.setStats(this.combatant().id, undefined);
      this.stopEditing();
    }
  }

  protected setText(key: TextKey, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((d) => d && { ...d, [key]: value });
  }

  protected setNumber(key: NumberKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) || 0;
    this.draft.update((d) => d && { ...d, [key]: value });
  }

  protected setSpeed(movement: Movement, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((d) => d && { ...d, speed: { ...d.speed, [movement]: value } });
  }

  protected setAbility(ability: Ability, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) || 0;
    this.draft.update((d) => d && { ...d, abilities: { ...d.abilities, [ability]: value } });
  }

  protected setEntry(key: EntryKey, index: number, field: keyof StatEntry, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update(
      (d) => d && { ...d, [key]: d[key].map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)) },
    );
  }

  protected addEntry(key: EntryKey): void {
    this.draft.update((d) => d && { ...d, [key]: [...d[key], { name: '', description: '' }] });
  }

  protected removeEntry(key: EntryKey, index: number): void {
    this.draft.update((d) => d && { ...d, [key]: d[key].filter((_, i) => i !== index) });
  }
}
