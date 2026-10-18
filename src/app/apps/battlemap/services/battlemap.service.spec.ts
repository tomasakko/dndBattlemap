import { TestBed } from '@angular/core/testing';
import { CreatureService } from '../../../shared/creatures/creature.service';
import { BattlemapService } from './battlemap.service';
import { InitiativeService } from './initiative.service';

describe('BattlemapService initiative persistence', () => {
  let battlemap: BattlemapService;
  let initiative: InitiativeService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        BattlemapService,
        InitiativeService,
        { provide: CreatureService, useValue: { findById: () => undefined } },
      ],
    });
    battlemap = TestBed.inject(BattlemapService);
    initiative = TestBed.inject(InitiativeService);
  });

  it('keeps initiative combatants when a map is loaded after adding them', () => {
    initiative.add('Goblin', 14, 'Goblin', 'enemy');
    initiative.addPlayer('fighter-id', 'Fighter', 12);
    battlemap.importState({ maps: [map('first')], currentId: 'first' });

    expect(initiative.combatants().map((combatant) => combatant.name)).toEqual([
      'Goblin',
      'Fighter',
    ]);
  });

  it('keeps each map initiative separate when switching between maps', () => {
    battlemap.importState({
      maps: [map('first'), map('second')],
      currentId: 'first',
    });
    initiative.add('Goblin', 14, 'Goblin', 'enemy');
    initiative.addPlayer('fighter-id', 'Fighter', 12);

    battlemap.selectMap('second');
    expect(initiative.combatants()).toEqual([]);

    initiative.add('Orc', 10, 'Orc', 'enemy');
    battlemap.selectMap('first');
    expect(initiative.combatants().map((combatant) => combatant.name)).toEqual([
      'Goblin',
      'Fighter',
    ]);

    battlemap.selectMap('second');
    expect(initiative.combatants().map((combatant) => combatant.name)).toEqual(['Orc']);
  });

  it('opens a linked map with saved rooms and initiative intact', () => {
    const target = {
      ...map('target'),
      rooms: [{ id: 'room', name: 'Room', points: [], revealed: true }],
      initiativeShared: true,
    };
    battlemap.importState({ maps: [map('first'), target], currentId: 'first' });

    expect(battlemap.openLinkedMap('target')).toBe(true);
    expect(battlemap.currentId()).toBe('target');
    expect(battlemap.sharedId()).toBeNull();
    expect(battlemap.rooms()[0].revealed).toBe(true);
    expect(initiative.shared()).toBe(true);
  });

  it('includes initiative data in project exports even when no map is selected', () => {
    initiative.add('Goblin', 14, 'Goblin', 'enemy');
    const saved = battlemap.exportState();
    battlemap.importState(saved);

    expect(initiative.combatants().map((combatant) => combatant.name)).toEqual(['Goblin']);
  });

  it('restores previously saved maps before the DM screen is opened', async () => {
    localStorage.setItem(
      'dnd-battlemap',
      JSON.stringify({ maps: [map('saved')], currentId: 'saved' }),
    );

    await battlemap.ensureRestored();

    expect(battlemap.maps().map((entry) => entry.id)).toEqual(['saved']);
    expect(battlemap.currentId()).toBe('saved');
  });
});

function map(id: string) {
  return {
    id,
    name: id,
    map: { url: 'data:image/png;base64,AA==', width: 100, height: 100 },
    rooms: [],
  };
}
