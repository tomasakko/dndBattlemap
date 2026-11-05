import type { MarkerStyle } from './marker-style';

export interface WorldmapImage {
  url: string;
  width: number;
  height: number;
}

/** A pin on a world map. Coordinates are image pixels, measured from the top-left corner. */
export interface WorldmapMarker extends MarkerStyle {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Whether players see it. */
  visible: boolean;
  /** A battlemap the DM can open from this marker. */
  battlemapId: string | null;
}

/** A world map with its own markers, so switching maps never carries markers over. */
export interface WorldmapEntry {
  id: string;
  name: string;
  image: WorldmapImage;
  markers: WorldmapMarker[];
}

/** Everything the Worldmap app saves. */
export interface WorldmapState {
  maps: WorldmapEntry[];
  currentId: string | null;
}

/** Where a map is looked at: the centre as a share of the image (0–1), and zoom relative to fitting it. */
export interface WorldmapView {
  centerX: number;
  centerY: number;
  zoom: number;
}

export const EMPTY_WORLDMAP: WorldmapState = { maps: [], currentId: null };
export const DEFAULT_VIEW: WorldmapView = { centerX: 0.5, centerY: 0.5, zoom: 1 };

export function currentWorldmap(state: WorldmapState): WorldmapEntry | null {
  return state.maps.find((entry) => entry.id === state.currentId) ?? null;
}

export function isValidView(view: WorldmapView): boolean {
  return Number.isFinite(view.centerX) && Number.isFinite(view.centerY) && Number.isFinite(view.zoom) && view.zoom > 0;
}

/** The part of the image a screen with this width/height ratio shows, in image pixels. */
export function viewRect(
  image: WorldmapImage,
  view: WorldmapView,
  aspect: number,
): { x: number; y: number; width: number; height: number } {
  const width = Math.max(image.width, image.height * aspect) / view.zoom;
  const height = width / aspect;
  return { x: view.centerX * image.width - width / 2, y: view.centerY * image.height - height / 2, width, height };
}
