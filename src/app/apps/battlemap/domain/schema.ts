import type { Schema } from '../../../shared/storage/persisted-state';
import type { Statblock } from '../../../shared/creatures/statblock';
import {
  BattlemapState,
  Combatant,
  EMPTY_INITIATIVE,
  InitiativeState,
  MapEntry,
  MapImage,
  PlayerPreset,
  Point,
  Room,
  View,
} from './model';
import { fitView } from './viewport';

/**
 * Saved Battlemap data.
 * - Version 0: everything before versioning. Several shapes: a single map at the top level; or a `maps` list
 *   with a top-level initiative (for the open map), per-map `initiativeShared`, a `sharedId` and map icons.
 * - Version 1: `BattlemapState`. Initiative lives on each map, including whether players see it.
 *   What players see is no longer saved here (the suite's player stage owns that).
 */
export const BATTLEMAP_SCHEMA: Schema<BattlemapState> = {
  name: 'battlemap',
  version: 1,
  migrate: (data, fromVersion) => (fromVersion === 0 ? fromVersion0(data) : data),
  validate: validateState,
};

type Legacy = {
  maps?: unknown;
  players?: unknown;
  currentId?: unknown;
  map?: unknown;
  rooms?: unknown;
  view?: unknown;
  initiative?: unknown;
  initiativeShared?: unknown;
};

type LegacyEntry = Record<string, unknown> & { id?: unknown; initiative?: unknown; initiativeShared?: unknown };

function fromVersion0(saved: unknown): unknown {
  const data = (saved ?? {}) as Legacy;
  if (typeof data !== 'object') {
    return data;
  }
  let maps: LegacyEntry[];
  let currentId = data.currentId;
  if (Array.isArray(data.maps)) {
    maps = data.maps as LegacyEntry[];
  } else if (data.map && typeof data.map === 'object') {
    // Single-map format from before maps could be switched.
    maps = [{ id: 'map-1', name: 'Map 1', map: data.map, rooms: data.rooms ?? [], view: data.view }];
    currentId = 'map-1';
  } else {
    throw new Error('No maps in file');
  }
  const current =
    maps.find((entry) => entry && entry.id === currentId) ?? (maps.length > 0 ? maps[0] : undefined);
  return {
    players: data.players ?? [],
    currentId: current?.id ?? null,
    maps: maps.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      // Older saves stored a map icon; it's dropped.
      const { icon: _icon, initiativeShared, initiative, ...rest } = entry;
      // The open map's initiative used to be kept at the top level.
      const legacyInitiative = entry === current ? (initiative ?? data.initiative) : initiative;
      const shared = initiativeShared ?? (entry === current ? data.initiativeShared : undefined);
      return {
        ...rest,
        initiative: legacyInitiative ? { ...(legacyInitiative as object), shared: shared === true } : undefined,
      };
    }),
  };
}

function validateState(saved: unknown): BattlemapState {
  const data = saved as { maps?: unknown; players?: unknown; currentId?: unknown } | null;
  if (!data || typeof data !== 'object' || !Array.isArray(data.maps)) {
    throw new Error('No maps in file');
  }
  const maps = data.maps.map(validateEntry);
  if (new Set(maps.map((entry) => entry.id)).size !== maps.length) {
    throw new Error('Two maps have the same id');
  }
  return {
    maps,
    players: validatePlayers(data.players ?? []),
    currentId: maps.some((m) => m.id === data.currentId) ? (data.currentId as string) : (maps[0]?.id ?? null),
  };
}

function validateEntry(saved: unknown): MapEntry {
  const data = saved as Partial<Record<keyof MapEntry, unknown>> | null;
  if (!data || typeof data.id !== 'string' || !data.id || typeof data.name !== 'string') {
    throw new Error('Invalid map data');
  }
  const map = validateImage(data.map);
  return {
    id: data.id,
    name: data.name,
    map,
    rooms: validateRooms(data.rooms ?? []),
    view: validateView(data.view) ?? fitView(map),
    initiative: data.initiative === undefined ? EMPTY_INITIATIVE : validateInitiative(data.initiative),
  };
}

function validateImage(saved: unknown): MapImage {
  const data = saved as Partial<MapImage> | null;
  if (
    !data ||
    typeof data.url !== 'string' ||
    !(typeof data.width === 'number' && data.width > 0) ||
    !(typeof data.height === 'number' && data.height > 0)
  ) {
    throw new Error('Invalid map data');
  }
  return { url: data.url, width: data.width, height: data.height };
}

function validateView(saved: unknown): View | null {
  const data = saved as Partial<View> | null;
  return data && isFiniteNumber(data.zoom) && isFiniteNumber(data.cx) && isFiniteNumber(data.cy)
    ? { zoom: data.zoom, cx: data.cx, cy: data.cy }
    : null;
}

function validateRooms(saved: unknown): Room[] {
  if (!Array.isArray(saved)) {
    throw new Error('Invalid area data');
  }
  return saved.map((room: unknown) => {
    const data = room as Partial<Record<keyof Room, unknown>> | null;
    if (!data || typeof data.id !== 'string' || typeof data.name !== 'string' || !Array.isArray(data.points)) {
      throw new Error('Invalid area data');
    }
    return {
      id: data.id,
      name: data.name,
      points: data.points.map(validatePoint),
      revealed: data.revealed === true,
    };
  });
}

function validatePoint(saved: unknown): Point {
  const data = saved as Partial<Point> | null;
  if (!data || !isFiniteNumber(data.x) || !isFiniteNumber(data.y)) {
    throw new Error('Invalid area data');
  }
  return { x: data.x, y: data.y };
}

export function validateInitiative(saved: unknown): InitiativeState {
  const data = saved as { combatants?: unknown; activeId?: unknown; shared?: unknown } | null;
  if (!data || typeof data !== 'object' || !Array.isArray(data.combatants)) {
    throw new Error('No initiative in file');
  }
  const combatants = data.combatants.map(validateCombatant);
  return {
    combatants,
    activeId: combatants.some((c) => c.id === data.activeId) ? (data.activeId as string) : null,
    shared: data.shared === true,
  };
}

function validateCombatant(saved: unknown): Combatant {
  const data = saved as Partial<Record<keyof Combatant, unknown>> | null;
  if (!data || typeof data.id !== 'string' || typeof data.name !== 'string' || !isFiniteNumber(data.initiative)) {
    throw new Error('Invalid combatant data');
  }
  return {
    id: data.id,
    name: data.name,
    initiative: data.initiative,
    type: typeof data.type === 'string' ? data.type : '',
    side: data.side === 'player' ? 'player' : 'enemy',
    ...(typeof data.playerId === 'string' ? { playerId: data.playerId } : {}),
    ...(data.stats && typeof data.stats === 'object' ? { stats: data.stats as Statblock } : {}),
    ...(isFiniteNumber(data.hp) ? { hp: data.hp } : {}),
  };
}

export function validatePlayers(saved: unknown): PlayerPreset[] {
  if (!Array.isArray(saved)) {
    throw new Error('Invalid player data');
  }
  return saved.map((player: unknown) => {
    const data = player as { id?: unknown; name?: unknown } | null;
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.id !== 'string' ||
      !data.id.trim() ||
      typeof data.name !== 'string' ||
      !data.name.trim()
    ) {
      throw new Error('Invalid player data');
    }
    return { id: data.id, name: data.name.trim() };
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
