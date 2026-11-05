import { addRoom, centroid, renameRoom, revealAll, roomColor, toggleRoom } from './rooms';

describe('rooms', () => {
  it('numbers new rooms and starts them hidden', () => {
    const rooms = addRoom(addRoom([], 'a', []), 'b', []);
    expect(rooms.map((r) => [r.name, r.revealed])).toEqual([
      ['Room 1', false],
      ['Room 2', false],
    ]);
  });

  it('keeps the old name when renamed to nothing', () => {
    const rooms = addRoom([], 'a', []);
    expect(renameRoom(rooms, 'a', '  ')[0].name).toBe('Room 1');
    expect(renameRoom(rooms, 'a', ' Hall ')[0].name).toBe('Hall');
  });

  it('reveals and hides', () => {
    const rooms = addRoom(addRoom([], 'a', []), 'b', []);
    expect(toggleRoom(rooms, 'a').map((r) => r.revealed)).toEqual([true, false]);
    expect(revealAll(rooms, true).every((r) => r.revealed)).toBe(true);
  });

  it('finds the centre of a polygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(centroid(square)).toEqual({ x: 1, y: 1 });
    expect(centroid([])).toEqual({ x: 0, y: 0 });
  });

  it('gives neighbouring rooms different colours', () => {
    expect(roomColor(0)).not.toBe(roomColor(1));
  });
});
