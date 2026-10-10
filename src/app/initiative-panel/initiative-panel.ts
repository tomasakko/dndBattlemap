import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CREATURE_TYPES, creatureType } from '../creature-types';
import { Combatant, InitiativeService, Side } from '../initiative.service';
import { StatblockCard } from '../statblock-card/statblock-card';

@Component({
  selector: 'app-initiative-panel',
  imports: [NgTemplateOutlet, ReactiveFormsModule, StatblockCard],
  templateUrl: './initiative-panel.html',
  styleUrl: './initiative-panel.css',
})
export class InitiativePanel {
  private readonly initiative = inject(InitiativeService);

  protected readonly combatants = this.initiative.ordered;
  protected readonly activeId = this.initiative.activeId;
  protected readonly types = CREATURE_TYPES;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    initiative: [null as number | null, [Validators.required]],
    type: [CREATURE_TYPES[0].id],
    side: ['enemy' as Side],
  });

  protected readonly error = signal('');
  private readonly statblockId = signal<string | null>(null);
  protected readonly statblockOf = computed(() => this.combatants().find((c) => c.id === this.statblockId()) ?? null);

  protected maxHp(combatant: Combatant): number {
    return this.initiative.maxHp(combatant);
  }

  protected hp(combatant: Combatant): number {
    return this.initiative.currentHp(combatant);
  }

  protected setHp(combatant: Combatant, event: Event): void {
    this.initiative.setHp(combatant.id, Number((event.target as HTMLInputElement).value));
  }

  protected showStatblock(combatant: Combatant): void {
    this.statblockId.set(combatant.id);
  }

  protected closeStatblock(): void {
    this.statblockId.set(null);
  }

  protected add(): void {
    const { name, initiative, type, side } = this.form.getRawValue();
    const missing = [name.trim() ? '' : 'a name', initiative === null ? 'an initiative' : ''].filter(Boolean);
    if (missing.length > 0) {
      this.error.set('Please enter ' + missing.join(' and ') + '.');
      return;
    }
    this.error.set('');
    this.initiative.add(name.trim(), Math.round(initiative!), type, side);
    this.form.patchValue({ name: '', initiative: null });
    this.form.markAsUntouched();
  }

  protected sideLabel(combatant: Combatant): string {
    return combatant.side === 'player' ? 'Player' : 'Enemy';
  }

  protected typeLabel(combatant: Combatant): string {
    return creatureType(combatant.type)?.label ?? combatant.type;
  }

  protected next(): void {
    this.initiative.next();
  }

  protected endCombat(): void {
    this.initiative.endCombat();
  }

  protected previous(): void {
    this.initiative.previous();
  }

  protected setActive(combatant: Combatant): void {
    this.initiative.setActive(combatant.id);
  }

  protected remove(combatant: Combatant): void {
    this.initiative.remove(combatant.id);
  }

  protected clear(): void {
    if (confirm('Remove everyone from the initiative order?')) {
      this.initiative.clear();
    }
  }
}
