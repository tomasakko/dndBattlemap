import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { CreatureService } from '../../../../shared/creatures/creature.service';
import type { Combatant } from '../../domain/model';
import { InitiativeService } from '../../state/initiative.service';

@Component({
  selector: 'app-combatant-row',
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
      this.host.nativeElement.querySelector<HTMLInputElement>('input.hp-edit')?.select(),
    );
  }

  /** Share of hit points left, for the slider's track. */
  protected hpFill(): string {
    const max = this.maxHp();
    return max > 0 ? ((this.hp() / max) * 100).toFixed(1) + '%' : '0%';
  }

  protected slideHp(event: Event): void {
    const hp = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(hp)) {
      this.initiative.setHp(this.combatant().id, Math.min(Math.max(Math.round(hp), 0), this.maxHp()));
    }
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
