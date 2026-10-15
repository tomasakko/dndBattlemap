import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CreatureService } from '../../../../shared/creatures/creature.service';
import { InitiativeService } from '../../services/initiative.service';
import type { Combatant } from '../../services/initiative.service';

@Component({
  selector: 'app-combatant-row',
  imports: [NgTemplateOutlet],
  templateUrl: './combatant-row.html',
  styleUrl: './combatant-row.css',
})
export class CombatantRow {
  private readonly initiative = inject(InitiativeService);
  private readonly creatures = inject(CreatureService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly combatant = input.required<Combatant>();
  readonly active = input.required<boolean>();
  readonly showStatblock = output<Combatant>();
  protected readonly editingHp = signal(false);

  protected maxHp(): number {
    return this.initiative.maxHp(this.combatant());
  }

  protected hp(): number {
    return this.initiative.currentHp(this.combatant());
  }

  protected editHp(): void {
    this.editingHp.set(true);
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLInputElement>('.hp-edit input')?.select(),
    );
  }

  protected commitHp(value: string): void {
    if (!this.editingHp()) {
      return;
    }
    this.editingHp.set(false);
    const max = this.maxHp();
    const hp = Math.min(Math.max(Math.round(Number(value)), 0), max);
    if (value.trim() !== '' && !Number.isNaN(hp)) {
      this.initiative.setHp(this.combatant().id, hp);
    }
  }

  protected sideLabel(): string {
    return this.combatant().side === 'player' ? 'Player' : 'Enemy';
  }

  protected typeLabel(): string {
    const type = this.combatant().type;
    return (this.creatures.findById(type)?.label ?? type) || 'Character';
  }

  protected setActive(): void {
    this.initiative.setActive(this.combatant().id);
  }

  protected remove(): void {
    this.initiative.remove(this.combatant().id);
  }
}
