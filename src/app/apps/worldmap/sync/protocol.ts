import type { WorldmapPlayerSlices } from '../domain/projection';

export const WORLDMAP_CHANNEL = 'dnd-worldmap';
/** Bump when the slices change shape. */
export const WORLDMAP_PROTOCOL = 3;

export type WorldmapSlices = WorldmapPlayerSlices;
