import { PlayerCombatant, playerSafeCombatants } from './initiative';
import type { BattlemapState, MapImage, Point, View } from './model';

/** An area as players get it: no DM-only name. */
export interface PlayerRoom {
  id: string;
  points: Point[];
  revealed: boolean;
}

export interface PlayerInitiative {
  combatants: PlayerCombatant[];
  activeId: string | null;
}

/** Everything the player screen receives, split so a pan doesn't resend the (large) image. */
export interface BattlemapPlayerSlices {
  image: MapImage | null;
  view: View | null;
  rooms: PlayerRoom[];
  /** Null while players don't see the turn order. */
  initiative: PlayerInitiative | null;
}

export const EMPTY_PLAYER_SLICES: BattlemapPlayerSlices = { image: null, view: null, rooms: [], initiative: null };

/** Which battlemap players see, if any: `mapId` null means the DM's open map. */
export interface BattlemapShown {
  mapId: string | null;
  /** A quick look from a world map link: nothing revealed, no turn order. */
  linked: boolean;
}

/**
 * What the players may see. Every player-safety rule lives here: hidden areas stay covered, DM-only names,
 * statblocks and hit points are left out, and a linked look reveals nothing.
 */
export function battlemapPlayerView(
  state: BattlemapState,
  shown: BattlemapShown | null,
  defaultHp: (type: string) => number | undefined,
): BattlemapPlayerSlices {
  if (!shown) {
    return EMPTY_PLAYER_SLICES;
  }
  const id = shown.mapId ?? state.currentId;
  const entry = state.maps.find((map) => map.id === id);
  if (!entry) {
    return EMPTY_PLAYER_SLICES;
  }
  return {
    image: entry.map,
    view: entry.view,
    rooms: entry.rooms.map((room) => ({
      id: room.id,
      points: room.points,
      revealed: shown.linked ? false : room.revealed,
    })),
    initiative:
      entry.initiative.shared && !shown.linked
        ? {
            combatants: playerSafeCombatants(entry.initiative.combatants, defaultHp),
            activeId: entry.initiative.activeId,
          }
        : null,
  };
}
