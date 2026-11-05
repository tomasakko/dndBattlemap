import { addCombatant, currentHp, numberedName, playerSafeCombatants, removeCombatant, step, turnOrder } from './initiative';
import type { Combatant, InitiativeState } from './model';

function combatant(id: string, initiative: number, extra: Partial<Combatant> = {}): Combatant {
  return { id, name: id, initiative, type: 'goblin', side: 'enemy', ...extra };
}

const state: InitiativeState = {
  combatants: [combatant('a', 10), combatant('b', 15), combatant('c', 10)],
  activeId: null,
  shared: false,
};

describe('initiative', () => {
  it('orders by initiative, keeping ties in the order they were added', () => {
    expect(turnOrder(state.combatants).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('starts at the top and wraps around', () => {
    let next = step(state, 1);
    expect(next.activeId).toBe('b');
    next = step(step(next, 1), 1);
    expect(next.activeId).toBe('c');
    expect(step(next, 1).activeId).toBe('b');
    expect(step(state, -1).activeId).toBe('c');
  });

  it('passes the turn on when the active combatant is removed', () => {
    expect(removeCombatant({ ...state, activeId: 'b' }, 'b').activeId).toBe('a');
  });

  it('adds a saved player only once', () => {
    const player = combatant('p', 12, { playerId: 'fighter', side: 'player' });
    const once = addCombatant(state, player);
    expect(addCombatant(once, { ...player, id: 'p2' }).combatants).toHaveLength(4);
  });

  it('keeps hit points within the maximum', () => {
    const hp = (type: string) => (type === 'goblin' ? 7 : undefined);
    expect(currentHp(combatant('a', 1), hp)).toBe(7);
    expect(currentHp(combatant('a', 1, { hp: 99 }), hp)).toBe(7);
    expect(currentHp(combatant('a', 1, { hp: -3 }), hp)).toBe(0);
  });

  it('numbers creatures of the same kind', () => {
    expect(numberedName('Goblin', [combatant('Goblin 1', 1), combatant('Goblin 4', 1)])).toBe('Goblin 5');
    expect(numberedName('Goblin (Boss)', [])).toBe('Goblin (Boss) 1');
  });

  it('tells players only whether someone is down', () => {
    const hp = () => 7;
    const [down, fine] = playerSafeCombatants(
      [combatant('a', 1, { hp: 0, stats: {} as Combatant['stats'] }), combatant('b', 1)],
      hp,
    );
    expect(down).toEqual({ id: 'a', name: 'a', type: 'goblin', side: 'enemy', initiative: 1, down: true });
    expect(fine.down).toBe(false);
    expect('hp' in down || 'stats' in down).toBe(false);
  });
});
