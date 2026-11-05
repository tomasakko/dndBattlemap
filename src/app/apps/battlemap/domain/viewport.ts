import type { MapImage, Point, View } from './model';

/** Player zoom limits. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;
/** The DM may zoom in further than the players, to draw precisely. */
export const DM_MAX_ZOOM = MAX_ZOOM * 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole map, centred. */
export function fitView(map: MapImage): View {
  return { zoom: 1, cx: map.width / 2, cy: map.height / 2 };
}

/** The part of the map a screen with the given width/height ratio shows. Zoom 1 fits the whole map. */
export function viewRect(map: MapImage, view: View, ratio: number): Rect {
  const w = Math.max(map.width, map.height * ratio) / view.zoom;
  const h = w / ratio;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

/** Keeps zoom within limits and the view on the map; a view wider than the map is centred. */
export function clampView(map: MapImage, view: View, ratio: number, maxZoom = MAX_ZOOM): View {
  const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, view.zoom));
  const { w, h } = viewRect(map, { ...view, zoom }, ratio);
  return {
    zoom,
    cx: w >= map.width ? map.width / 2 : Math.min(map.width - w / 2, Math.max(w / 2, view.cx)),
    cy: h >= map.height ? map.height / 2 : Math.min(map.height - h / 2, Math.max(h / 2, view.cy)),
  };
}

/** The ratio of the DM's board: the map's own, so zoom 1 shows exactly the whole map. */
export function mapRatio(map: MapImage): number {
  return map.width / map.height;
}

/** Zooms by `factor` within the limits, keeping `anchor` (default: the centre) at the same place on screen. */
export function zoomAround(
  view: View,
  factor: number,
  anchor: Point = { x: view.cx, y: view.cy },
  maxZoom = MAX_ZOOM,
): View {
  const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, view.zoom * factor));
  const ratio = view.zoom / zoom;
  return { zoom, cx: anchor.x - (anchor.x - view.cx) * ratio, cy: anchor.y - (anchor.y - view.cy) * ratio };
}

/** Moves the view by a share of what is visible, e.g. 0.1 = a tenth of the screen. */
export function panByScreen(map: MapImage, view: View, ratio: number, dx: number, dy: number): View {
  const rect = viewRect(map, view, ratio);
  return { ...view, cx: view.cx + rect.w * dx, cy: view.cy + rect.h * dy };
}

export function viewBoxFor(rect: Rect): string {
  return `${rect.x} ${rect.y} ${rect.w} ${rect.h}`;
}

/** The map with a window cut out: evenodd fill dims everything outside `rect`. */
export function dimPath(map: MapImage, rect: Rect): string {
  return `M0 0H${map.width}V${map.height}H0Z M${rect.x} ${rect.y}h${rect.w}v${rect.h}h${-rect.w}Z`;
}
