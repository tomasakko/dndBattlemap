import { Component, ElementRef, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { InitiativeService } from '../services/initiative.service';
import type { Combatant } from '../services/initiative.service';
import { StatblockCard } from '../statblock-card/statblock-card';
import { CombatantForm } from './combatant-form/combatant-form';
import { CombatantRow } from './combatant-row/combatant-row';

@Component({
  selector: 'app-initiative-panel',
  imports: [StatblockCard, CombatantForm, CombatantRow],
  templateUrl: './initiative-panel.html',
  styleUrl: './initiative-panel.css',
})
export class InitiativePanel {
  private readonly initiative = inject(InitiativeService);
  private readonly confirm = inject(ConfirmService);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      if (this.activeId()) {
        this.host.nativeElement.querySelector('li.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  protected readonly combatants = this.initiative.ordered;
  protected readonly activeId = this.initiative.activeId;
  private readonly statblockId = signal<string | null>(null);
  protected readonly statblockOf = computed(() => this.combatants().find((c) => c.id === this.statblockId()) ?? null);

  protected showStatblock(combatant: Combatant): void {
    this.statblockId.set(combatant.id);
  }

  protected closeStatblock(): void {
    this.statblockId.set(null);
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

  protected async clear(): Promise<void> {
    if (await this.confirm.ask('Remove everyone from the initiative order?', 'Remove all')) {
      this.initiative.clear();
    }
  }
}
