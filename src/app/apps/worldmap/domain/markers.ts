import { DEFAULT_MARKER_STYLE, MarkerStyle, normaliseMarkerStyle } from './marker-style';
import type { WorldmapEntry, WorldmapMarker } from './model';

export function addMarker(entry: WorldmapEntry, id: string, x: number, y: number): WorldmapEntry {
  const marker: WorldmapMarker = {
    id,
    name: `Marker ${entry.markers.length + 1}`,
    x,
    y,
    visible: true,
    battlemapId: null,
    ...DEFAULT_MARKER_STYLE,
  };
  return { ...entry, markers: [...entry.markers, marker] };
}

export function patchMarker(
  entry: WorldmapEntry,
  id: string,
  patch: Partial<Omit<WorldmapMarker, 'id'>>,
): WorldmapEntry {
  return { ...entry, markers: entry.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

/** Moves a marker, keeping it on the image. */
export function moveMarker(entry: WorldmapEntry, id: string, x: number, y: number): WorldmapEntry {
  const clampedX = Math.min(Math.max(x, 0), entry.image.width);
  const clampedY = Math.min(Math.max(y, 0), entry.image.height);
  return patchMarker(entry, id, { x: clampedX, y: clampedY });
}

/** Renames a marker; an empty name becomes "Marker". */
export function renameMarker(entry: WorldmapEntry, id: string, name: string): WorldmapEntry {
  return patchMarker(entry, id, { name: name.trim() || 'Marker' });
}

/** Changes part of a marker's look; unknown values fall back to the defaults. */
export function styleMarker(entry: WorldmapEntry, id: string, style: Partial<MarkerStyle>): WorldmapEntry {
  const marker = entry.markers.find((m) => m.id === id);
  return marker ? patchMarker(entry, id, normaliseMarkerStyle({ ...marker, ...style })) : entry;
}

export function removeMarker(entry: WorldmapEntry, id: string): WorldmapEntry {
  return { ...entry, markers: entry.markers.filter((m) => m.id !== id) };
}

/** Markers alphabetically, for the Markers list. */
export function sortedMarkers(markers: readonly WorldmapMarker[]): WorldmapMarker[] {
  return [...markers].sort((a, b) => a.name.localeCompare(b.name));
}
