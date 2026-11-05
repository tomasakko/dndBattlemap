import type { Statblock } from '../../../shared/creatures/statblock';

export interface Point {
  x: number;
  y: number;
}

/** An area of the map that is covered by fog until the DM reveals it. */
export interface Room {
  id: string;
  name: string;
  points: Point[];
  revealed: boolean;
}

export interface MapImage {
  url: string;
  width: number;
  height: number;
}

/** Zoom factor (1 = whole map) and the map coordinate shown at the centre of the screen. */
export interface View {
  zoom: number;
  cx: number;
  cy: number;
}

export type Side = 'player' | 'enemy';

export interface Combatant {
  id: string;
  /** Set for combatants added from the saved player roster. */
  playerId?: string;
  name: string;
  initiative: number;
  /** Creature id from the bestiary, or a free text type. */
  type: string;
  side: Side;
  /** DM edits to this creature's statblock. Without it, the creature type's default is used. DM-only. */
  stats?: Statblock;
  /** Current hit points. Undefined means full health. DM-only; players only learn whether the creature is down. */
  hp?: number;
}

export interface InitiativeState {
  combatants: Combatant[];
  activeId: string | null;
  /** Whether players see the turn order. */
  shared: boolean;
}

export interface MapEntry {
  id: string;
  name: string;
  map: MapImage;
  rooms: Room[];
  /** What the players see of this map. */
  view: View;
  initiative: InitiativeState;
}

/** A player character kept ready to add to any map's initiative order. */
export interface PlayerPreset {
  id: string;
  name: string;
}

/** Everything the Battlemap app saves. */
export interface BattlemapState {
  maps: MapEntry[];
  /** The map the DM is working on. */
  currentId: string | null;
  players: PlayerPreset[];
}

export const EMPTY_INITIATIVE: InitiativeState = { combatants: [], activeId: null, shared: false };

export const EMPTY_BATTLEMAP: BattlemapState = { maps: [], currentId: null, players: [] };

export function currentMap(state: BattlemapState): MapEntry | null {
  return state.maps.find((entry) => entry.id === state.currentId) ?? null;
}
