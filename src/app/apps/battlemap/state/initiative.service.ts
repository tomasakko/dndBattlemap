import { Service, computed, inject } from '@angular/core';
import { CreatureService } from '../../../shared/creatures/creature.service';
import type { Statblock } from '../../../shared/creatures/statblock';
import { newId } from '../../../shared/util/id';
import * as rules from '../domain/initiative';
import { Combatant, EMPTY_INITIATIVE, InitiativeState, Side } from '../domain/model';
import { BattlemapStore } from './battlemap.store';

/** The open map's initiative order. Its state lives on the map in the store; this is just the operations. */
@Service()
export class InitiativeService {
  private readonly store = inject(BattlemapStore);
  private readonly creatures = inject(CreatureService);

  readonly state = computed(() => this.store.current()?.initiative ?? EMPTY_INITIATIVE);
  readonly combatants = computed(() => this.state().combatants);
  readonly activeId = computed(() => this.state().activeId);
  /** Whether players see the turn order. */
  readonly shared = computed(() => this.state().shared);
  readonly ordered = computed(() => rules.turnOrder(this.combatants()));

  /** The bestiary's hit points for a creature type. */
  readonly defaultHp = (type: string): number | undefined => this.creatures.findById(type)?.statblock.hitPoints;

  add(name: string, initiative: number, type: string, side: Side): void {
    this.update((state) => rules.addCombatant(state, { id: newId(), name, initiative, type, side }));
  }

  addPlayer(playerId: string, name: string, initiative: number): void {
    this.update((state) =>
      rules.addCombatant(state, { id: newId(), playerId, name, initiative, type: 'Character', side: 'player' }),
    );
  }

  setStats(id: string, stats: Statblock | undefined): void {
    this.update((state) => rules.patchCombatant(state, id, { stats }));
  }

  setHp(id: string, hp: number): void {
    this.update((state) => rules.patchCombatant(state, id, { hp }));
  }

  maxHp(combatant: Combatant): number {
    return rules.maxHp(combatant, this.defaultHp);
  }

  currentHp(combatant: Combatant): number {
    return rules.currentHp(combatant, this.defaultHp);
  }

  remove(id: string): void {
    this.update((state) => rules.removeCombatant(state, id));
  }

  clear(): void {
    this.update((state) => ({ ...state, combatants: [], activeId: null }));
  }

  setActive(id: string): void {
    this.update((state) => ({ ...state, activeId: id }));
  }

  /** Stops the fight but keeps everyone listed, so the same order can be started again. */
  endCombat(): void {
    this.update((state) => ({ ...state, activeId: null }));
  }

  next(): void {
    this.update((state) => rules.step(state, 1));
  }

  previous(): void {
    this.update((state) => rules.step(state, -1));
  }

  setShared(shared: boolean): void {
    this.update((state) => ({ ...state, shared }));
  }

  /** "Goblin 3" when Goblin 1 and 2 are already in the fight. */
  numberedName(type: string): string {
    return rules.numberedName(this.creatures.findById(type)?.label ?? type, this.combatants());
  }

  private update(change: (state: InitiativeState) => InitiativeState): void {
    this.store.updateCurrent((entry) => ({ ...entry, initiative: change(entry.initiative) }));
  }
}
