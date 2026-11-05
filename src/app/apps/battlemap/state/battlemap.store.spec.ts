import { TestBed } from '@angular/core/testing';
import { CreatureService } from '../../../shared/creatures/creature.service';
import { toEnvelope } from '../../../shared/storage/persisted-state';
import { BATTLEMAP_SCHEMA } from '../domain/schema';
import { EMPTY_INITIATIVE, MapEntry } from '../domain/model';
import { BattlemapStore } from './battlemap.store';
import { InitiativeService } from './initiative.service';
import { PlayerRosterService } from './player-roster.service';

describe('BattlemapStore', () => {
  let store: BattlemapStore;
  let initiative: InitiativeService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: CreatureService, useValue: { findById: () => undefined } }],
    });
    store = TestBed.inject(BattlemapStore);
    initiative = TestBed.inject(InitiativeService);
  });

  it('keeps each map initiative separate when switching between maps', () => {
    store.replace({ maps: [map('first'), map('second')], currentId: 'first', players: [] });
    initiative.add('Goblin', 14, 'goblin', 'enemy');
    initiative.addPlayer('fighter-id', 'Fighter', 12);

    store.selectMap('second');
    expect(initiative.combatants()).toEqual([]);

    initiative.add('Orc', 10, 'orc', 'enemy');
    store.selectMap('first');
    expect(initiative.ordered().map((c) => c.name)).toEqual(['Goblin', 'Fighter']);

    store.selectMap('second');
    expect(initiative.combatants().map((c) => c.name)).toEqual(['Orc']);
  });

  it('does not switch or delete maps while a fight is running', () => {
    store.replace({ maps: [map('first'), map('second')], currentId: 'first', players: [] });
    initiative.add('Goblin', 14, 'goblin', 'enemy');
    initiative.next();

    expect(store.locked()).toBe(true);
    expect(store.selectMap('second')).toBe(false);
    expect(store.removeMap('second')).toBe(false);

    initiative.endCombat();
    expect(store.selectMap('second')).toBe(true);
  });

  it('keeps the sidebar and search in step with the open map', () => {
    store.replace({ maps: [map('first')], currentId: 'first', players: [] });
    initiative.add('Goblin', 14, 'goblin', 'enemy');
    expect(store.maps()[0].initiative.combatants.map((c) => c.name)).toEqual(['Goblin']);
  });

  it('keeps the player view within the map', () => {
    store.replace({ maps: [map('first')], currentId: 'first', players: [] });
    store.setView({ zoom: 50, cx: -10, cy: -10 });
    expect(store.current()?.view.zoom).toBe(10);
  });

  it('keeps saved players across maps', () => {
    store.replace({ maps: [map('first'), map('second')], currentId: 'first', players: [] });
    TestBed.inject(PlayerRosterService).add(' Fighter ');
    store.selectMap('second');
    expect(store.players().map((p) => p.name)).toEqual(['Fighter']);
  });

  it('restores previously saved maps, including saves from before versioning', async () => {
    localStorage.setItem('dnd-battlemap', JSON.stringify({ maps: [map('saved')], currentId: 'saved' }));
    await store.ensureRestored();
    expect(store.maps().map((entry) => entry.id)).toEqual(['saved']);
    expect(store.currentId()).toBe('saved');
  });

  it('restores the versioned format', async () => {
    const state = { maps: [map('saved')], currentId: 'saved', players: [] };
    localStorage.setItem('dnd-battlemap', JSON.stringify(toEnvelope(BATTLEMAP_SCHEMA, state)));
    await store.ensureRestored();
    expect(store.snapshot()).toEqual(state);
  });
});

function map(id: string): MapEntry {
  return {
    id,
    name: id,
    map: { url: 'data:image/png;base64,AA==', width: 100, height: 100 },
    rooms: [],
    view: { zoom: 1, cx: 50, cy: 50 },
    initiative: EMPTY_INITIATIVE,
  };
}
