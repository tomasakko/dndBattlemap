import { DEFAULT_MARKER_STYLE } from './marker-style';
import type { WorldmapState } from './model';
import { worldmapPlayerView } from './projection';

const marker = { ...DEFAULT_MARKER_STYLE, x: 1, y: 1, battlemapId: null };
const state: WorldmapState = {
  currentId: 'w',
  maps: [
    {
      id: 'w',
      name: 'World',
      image: { url: 'u', width: 10, height: 10 },
      markers: [
        { ...marker, id: 'seen', name: 'Town', visible: true },
        { ...marker, id: 'secret', name: 'Lair', visible: false },
      ],
    },
  ],
};

describe('worldmap player view', () => {
  it('shows nothing while the world map is not on the stage', () => {
    expect(worldmapPlayerView(state, false, {}, true).map).toBeNull();
  });

  it('shows only visible markers, where the DM is looking', () => {
    const view = worldmapPlayerView(state, true, { w: { centerX: 0.2, centerY: 0.3, zoom: 2 } }, false);
    expect(view.markers.map((m) => m.id)).toEqual(['seen']);
    expect(view.view).toEqual({ centerX: 0.2, centerY: 0.3, zoom: 2 });
    expect(view.waterAnimated).toBe(false);
  });
});
