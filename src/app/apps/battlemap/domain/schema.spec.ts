import { fromSaved, toEnvelope } from '../../../shared/storage/persisted-state';
import { BATTLEMAP_SCHEMA } from './schema';

const image = { url: 'data:image/png;base64,AA==', width: 100, height: 50 };

describe('battlemap saved data', () => {
  it('reads the single-map format from before maps could be switched', () => {
    const state = fromSaved(BATTLEMAP_SCHEMA, { map: image, rooms: [], shared: true });
    expect(state.maps).toHaveLength(1);
    expect(state.currentId).toBe(state.maps[0].id);
    expect(state.maps[0].view).toEqual({ zoom: 1, cx: 50, cy: 25 });
  });

  it('moves the old top-level initiative onto the open map', () => {
    const state = fromSaved(BATTLEMAP_SCHEMA, {
      maps: [
        { id: 'a', name: 'A', map: image, rooms: [] },
        { id: 'b', name: 'B', map: image, rooms: [] },
      ],
      currentId: 'b',
      sharedId: 'b',
      initiative: { combatants: [{ id: 'g', name: 'Goblin', initiative: 12 }], activeId: 'g' },
      initiativeShared: true,
    });
    const [a, b] = state.maps;
    expect(a.initiative.combatants).toEqual([]);
    expect(b.initiative.combatants.map((c) => [c.name, c.side])).toEqual([['Goblin', 'enemy']]);
    expect(b.initiative.activeId).toBe('g');
    expect(b.initiative.shared).toBe(true);
  });

  it('keeps per-map initiative and drops old map icons', () => {
    const state = fromSaved(BATTLEMAP_SCHEMA, {
      maps: [
        {
          id: 'a',
          name: 'A',
          map: image,
          rooms: [],
          icon: 'castle',
          initiative: { combatants: [], activeId: null },
          initiativeShared: true,
        },
      ],
      players: [{ id: 'p', name: ' Fighter ' }],
    });
    expect('icon' in state.maps[0]).toBe(false);
    expect(state.maps[0].initiative.shared).toBe(true);
    expect(state.players).toEqual([{ id: 'p', name: 'Fighter' }]);
  });

  it('round-trips the current format', () => {
    const state = fromSaved(BATTLEMAP_SCHEMA, { maps: [{ id: 'a', name: 'A', map: image, rooms: [] }] });
    expect(fromSaved(BATTLEMAP_SCHEMA, JSON.parse(JSON.stringify(toEnvelope(BATTLEMAP_SCHEMA, state))))).toEqual(
      state,
    );
  });

  it('rejects broken data with a readable message', () => {
    expect(() => fromSaved(BATTLEMAP_SCHEMA, { nothing: true })).toThrowError('No maps in file');
    expect(() => fromSaved(BATTLEMAP_SCHEMA, { maps: [{ id: 'a', name: 'A', map: { url: 'x' } }] })).toThrowError(
      'Invalid map data',
    );
    expect(() =>
      fromSaved(BATTLEMAP_SCHEMA, { maps: [{ id: 'a', name: 'A', map: image, rooms: [] }], players: [{ id: 'p' }] }),
    ).toThrowError('Invalid player data');
  });
});
