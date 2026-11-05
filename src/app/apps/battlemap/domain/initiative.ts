import type { Combatant, InitiativeState } from './model';

/** Highest initiative first. The sort is stable, so ties keep the order they were added in. */
export function turnOrder(combatants: readonly Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => b.initiative - a.initiative);
}

/** The combatant `direction` places away from `id` in turn order, wrapping around. */
export function neighbourOf(combatants: readonly Combatant[], id: string, direction: 1 | -1): string | null {
  const order = turnOrder(combatants);
  const index = order.findIndex((c) => c.id === id);
  if (order.length <= 1 || index < 0) {
    return null;
  }
  return order[(index + direction + order.length) % order.length].id;
}

/** Moves the turn on (or back); starts at the top (or bottom) when no one is active yet. */
export function step(state: InitiativeState, direction: 1 | -1): InitiativeState {
  const order = turnOrder(state.combatants);
  if (order.length === 0) {
    return state;
  }
  const activeId = state.activeId
    ? neighbourOf(state.combatants, state.activeId, direction)
    : order[direction === 1 ? 0 : order.length - 1].id;
  return { ...state, activeId };
}

export function addCombatant(state: InitiativeState, combatant: Combatant): InitiativeState {
  if (combatant.playerId && state.combatants.some((c) => c.playerId === combatant.playerId)) {
    return state;
  }
  return { ...state, combatants: [...state.combatants, combatant] };
}

export function patchCombatant(state: InitiativeState, id: string, patch: Partial<Combatant>): InitiativeState {
  return { ...state, combatants: state.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** Removes a combatant; if it was their turn, the next one in order takes over. */
export function removeCombatant(state: InitiativeState, id: string): InitiativeState {
  const activeId = state.activeId === id ? neighbourOf(state.combatants, id, 1) : state.activeId;
  return { ...state, activeId, combatants: state.combatants.filter((c) => c.id !== id) };
}

/** Maximum hit points: the DM's edited statblock, else the creature type's default. 0 when unknown. */
export function maxHp(combatant: Combatant, defaultHp: (type: string) => number | undefined): number {
  return combatant.stats?.hitPoints ?? defaultHp(combatant.type) ?? 0;
}

export function currentHp(combatant: Combatant, defaultHp: (type: string) => number | undefined): number {
  const max = maxHp(combatant, defaultHp);
  return Math.min(Math.max(combatant.hp ?? max, 0), max);
}

/** "Goblin 3" when Goblin 1 and 2 already exist. */
export function numberedName(label: string, combatants: readonly Combatant[]): string {
  const pattern = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$', 'i');
  const highest = combatants.reduce((max, c) => Math.max(max, Number(pattern.exec(c.name)?.[1] ?? 0)), 0);
  return `${label} ${highest + 1}`;
}

/** A combatant as players may see it: no statblock, no hit points, only whether they are down. */
export interface PlayerCombatant {
  id: string;
  name: string;
  type: string;
  side: Combatant['side'];
  initiative: number;
  playerId?: string;
  down: boolean;
}

export function playerSafeCombatants(
  combatants: readonly Combatant[],
  defaultHp: (type: string) => number | undefined,
): PlayerCombatant[] {
  return combatants.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    side: c.side,
    initiative: c.initiative,
    ...(c.playerId ? { playerId: c.playerId } : {}),
    down: maxHp(c, defaultHp) > 0 && currentHp(c, defaultHp) === 0,
  }));
}
