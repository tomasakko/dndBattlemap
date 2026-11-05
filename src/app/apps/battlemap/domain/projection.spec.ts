import { EMPTY_INITIATIVE, type BattlemapState } from './model';
import { battlemapPlayerView } from './projection';

const image = { url: 'u', width: 100, height: 100 };
const state: BattlemapState = {
  currentId: 'a',
  players: [],
  maps: [
    {
      id: 'a',
      name: 'A',
      map: image,
      view: { zoom: 2, cx: 50, cy: 50 },
      rooms: [{ id: 'r', name: 'Secret vault', points: [{ x: 0, y: 0 }], revealed: true }],
      initiative: {
        combatants: [{ id: 'g', name: 'Goblin', initiative: 3, type: 'goblin', side: 'enemy', hp: 0 }],
        activeId: 'g',
        shared: true,
      },
    },
    { id: 'b', name: 'B', map: image, view: { zoom: 1, cx: 50, cy: 50 }, rooms: [], initiative: EMPTY_INITIATIVE },
  ],
};
const hp = () => 7;

describe('battlemap player view', () => {
  it('shows nothing while the battlemap is not on the stage', () => {
    expect(battlemapPlayerView(state, null, hp).image).toBeNull();
  });

  it('shows the shared map without DM-only details', () => {
    const view = battlemapPlayerView(state, { mapId: 'a', linked: false }, hp);
    expect(view.image).toBe(image);
    expect(view.rooms).toEqual([{ id: 'r', points: [{ x: 0, y: 0 }], revealed: true }]);
    expect(view.initiative?.combatants[0]).toEqual({
      id: 'g',
      name: 'Goblin',
      type: 'goblin',
      side: 'enemy',
      initiative: 3,
      down: true,
    });
  });

  it('shows a linked map with everything covered and no turn order', () => {
    const view = battlemapPlayerView(state, { mapId: 'a', linked: true }, hp);
    expect(view.rooms.every((room) => !room.revealed)).toBe(true);
    expect(view.initiative).toBeNull();
  });

  it('shows the shared map even while the DM works on another one', () => {
    const view = battlemapPlayerView({ ...state, currentId: 'b' }, { mapId: 'a', linked: false }, hp);
    expect(view.view).toEqual({ zoom: 2, cx: 50, cy: 50 });
  });

  it('shows nothing for a map that no longer exists', () => {
    expect(battlemapPlayerView(state, { mapId: 'gone', linked: false }, hp).image).toBeNull();
  });
});
