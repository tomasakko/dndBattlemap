import { DM_MAX_ZOOM, MAX_ZOOM, clampView, dimPath, fitView, mapRatio, panByScreen, viewRect, zoomAround } from './viewport';

const map = { url: '', width: 1000, height: 500 };

describe('viewport', () => {
  it('fits the whole map at zoom 1', () => {
    expect(viewRect(map, fitView(map), mapRatio(map))).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });

  it('keeps the view on the map', () => {
    const view = clampView(map, { zoom: 2, cx: -100, cy: 9999 }, 2);
    expect(view).toEqual({ zoom: 2, cx: 250, cy: 375 });
  });

  it('centres a view wider than the map', () => {
    expect(clampView(map, { zoom: 1, cx: 10, cy: 10 }, 4)).toEqual({ zoom: 1, cx: 500, cy: 250 });
  });

  it('limits zoom', () => {
    expect(clampView(map, { zoom: 50, cx: 500, cy: 250 }, 2).zoom).toBe(MAX_ZOOM);
    expect(clampView(map, { zoom: 50, cx: 500, cy: 250 }, 2, DM_MAX_ZOOM).zoom).toBe(DM_MAX_ZOOM);
    expect(clampView(map, { zoom: 0.1, cx: 500, cy: 250 }, 2).zoom).toBe(1);
  });

  it('zooms around a point, keeping it in place', () => {
    const view = zoomAround({ zoom: 1, cx: 500, cy: 250 }, 2, { x: 1000, y: 250 });
    expect(view).toEqual({ zoom: 2, cx: 750, cy: 250 });
  });

  it('pans by a share of the screen', () => {
    const view = panByScreen(map, { zoom: 2, cx: 500, cy: 250 }, 2, 0.1, 0);
    expect(view.cx).toBeCloseTo(550);
  });

  it('cuts the player view out of the dimmed map', () => {
    expect(dimPath(map, { x: 1, y: 2, w: 3, h: 4 })).toBe('M0 0H1000V500H0Z M1 2h3v4h-3Z');
  });
});
