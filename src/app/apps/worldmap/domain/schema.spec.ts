import { fromSaved } from '../../../shared/storage/persisted-state';
import { WORLDMAP_SCHEMA } from './schema';

const image = { url: 'u', width: 100, height: 50 };

describe('worldmap saved data', () => {
  it('reads the single-map format', () => {
    const state = fromSaved(WORLDMAP_SCHEMA, { image, markers: [{ id: 'm', name: 'Keep', x: 1, y: 2 }] });
    expect(state.maps).toHaveLength(1);
    expect(state.maps[0].markers[0]).toEqual(
      expect.objectContaining({ name: 'Keep', visible: true, battlemapId: null, font: 'bahnschrift' }),
    );
    expect(state.currentId).toBe(state.maps[0].id);
  });

  it('reads an empty old save', () => {
    expect(fromSaved(WORLDMAP_SCHEMA, {})).toEqual({ maps: [], currentId: null });
  });

  it('falls back to the first map when the open one is missing', () => {
    const state = fromSaved(WORLDMAP_SCHEMA, { maps: [{ id: 'a', name: 'A', image, markers: [] }], currentId: 'x' });
    expect(state.currentId).toBe('a');
  });

  it('rejects duplicate ids and broken markers', () => {
    const map = { id: 'a', name: 'A', image, markers: [] };
    expect(() => fromSaved(WORLDMAP_SCHEMA, { maps: [map, map] })).toThrowError('Duplicate world map ids');
    expect(() =>
      fromSaved(WORLDMAP_SCHEMA, { maps: [{ ...map, markers: [{ id: 'm', name: 'M', x: 'left', y: 0 }] }] }),
    ).toThrowError('Invalid world map markers');
  });
});
