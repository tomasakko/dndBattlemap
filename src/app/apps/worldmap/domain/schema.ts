import type { Schema } from '../../../shared/storage/persisted-state';
import { normaliseMarkerStyle } from './marker-style';
import type { WorldmapEntry, WorldmapMarker, WorldmapState } from './model';

/**
 * Saved Worldmap data.
 * - Version 0: everything before versioning: `WorldmapState`, or a single map (or none) directly on the state.
 * - Version 1: `WorldmapState`.
 */
export const WORLDMAP_SCHEMA: Schema<WorldmapState> = {
  name: 'worldmap',
  version: 1,
  migrate: (data, fromVersion) => (fromVersion === 0 ? fromVersion0(data) : data),
  validate: validateState,
};

function fromVersion0(saved: unknown): unknown {
  const data = saved as { maps?: unknown; image?: unknown } | null;
  if (!data || typeof data !== 'object' || 'maps' in data) {
    return data;
  }
  // Saves from before multiple maps held a single map (or none) directly on the state.
  if (!data.image) {
    return { maps: [], currentId: null };
  }
  const id = 'worldmap-1';
  return { maps: [{ id, name: 'World map', ...data }], currentId: id };
}

function validateState(saved: unknown): WorldmapState {
  const data = saved as { maps?: unknown; currentId?: unknown } | null;
  if (!data || typeof data !== 'object') {
    throw new Error('No world map in file');
  }
  if (!Array.isArray(data.maps)) {
    throw new Error('Invalid world maps');
  }
  const maps = data.maps.map((entry, index) => validateEntry(entry, `worldmap-${index + 1}`));
  if (new Set(maps.map((entry) => entry.id)).size !== maps.length) {
    throw new Error('Duplicate world map ids');
  }
  return {
    maps,
    currentId: maps.some((entry) => entry.id === data.currentId)
      ? (data.currentId as string)
      : (maps[0]?.id ?? null),
  };
}

function validateEntry(saved: unknown, fallbackId: string): WorldmapEntry {
  const data = saved as Partial<Record<keyof WorldmapEntry, unknown>> | null;
  const image = data?.image as Partial<WorldmapEntry['image']> | undefined;
  if (
    !data ||
    !image ||
    typeof image.url !== 'string' ||
    !(typeof image.width === 'number' && image.width > 0) ||
    !(typeof image.height === 'number' && image.height > 0)
  ) {
    throw new Error('Invalid world map image');
  }
  return {
    id: typeof data.id === 'string' && data.id ? data.id : fallbackId,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'World map',
    image: { url: image.url, width: image.width, height: image.height },
    markers: validateMarkers(data.markers ?? []),
  };
}

function validateMarkers(markers: unknown): WorldmapMarker[] {
  if (!Array.isArray(markers)) {
    throw new Error('Invalid world map markers');
  }
  return markers.map((saved: unknown) => {
    const marker = saved as Partial<Record<keyof WorldmapMarker, unknown>> | null;
    if (
      !marker ||
      typeof marker.id !== 'string' ||
      typeof marker.name !== 'string' ||
      !Number.isFinite(marker.x) ||
      !Number.isFinite(marker.y) ||
      !(marker.visible === undefined || typeof marker.visible === 'boolean')
    ) {
      throw new Error('Invalid world map markers');
    }
    return {
      id: marker.id,
      name: marker.name,
      x: marker.x as number,
      y: marker.y as number,
      visible: marker.visible ?? true,
      battlemapId: typeof marker.battlemapId === 'string' ? marker.battlemapId : null,
      ...normaliseMarkerStyle(marker as Parameters<typeof normaliseMarkerStyle>[0]),
    };
  });
}
