import { addMarker, moveMarker, renameMarker, sortedMarkers, styleMarker } from './markers';
import type { WorldmapEntry } from './model';

const entry: WorldmapEntry = { id: 'w', name: 'W', image: { url: 'u', width: 100, height: 50 }, markers: [] };

describe('markers', () => {
  it('numbers new markers and shows them to players', () => {
    const next = addMarker(addMarker(entry, 'a', 1, 1), 'b', 2, 2);
    expect(next.markers.map((m) => [m.name, m.visible])).toEqual([
      ['Marker 1', true],
      ['Marker 2', true],
    ]);
  });

  it('keeps markers on the image', () => {
    const moved = moveMarker(addMarker(entry, 'a', 1, 1), 'a', -5, 80);
    expect([moved.markers[0].x, moved.markers[0].y]).toEqual([0, 50]);
  });

  it('names nameless markers "Marker"', () => {
    expect(renameMarker(addMarker(entry, 'a', 1, 1), 'a', '   ').markers[0].name).toBe('Marker');
  });

  it('ignores unknown styles', () => {
    const styled = styleMarker(addMarker(entry, 'a', 1, 1), 'a', { color: 'red', size: 'huge' });
    expect([styled.markers[0].color, styled.markers[0].size]).toEqual(['#ffffff', 'huge']);
  });

  it('sorts markers by name', () => {
    const named = renameMarker(addMarker(addMarker(entry, 'a', 1, 1), 'b', 1, 1), 'a', 'Zed');
    expect(sortedMarkers(named.markers).map((m) => m.name)).toEqual(['Marker 2', 'Zed']);
  });
});
