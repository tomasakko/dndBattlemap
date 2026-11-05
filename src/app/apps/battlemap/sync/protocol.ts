import type { BattlemapPlayerSlices } from '../domain/projection';

export const BATTLEMAP_CHANNEL = 'dnd-battlemap';
/** Bump when the slices or commands change shape. */
export const BATTLEMAP_PROTOCOL = 2;

export type BattlemapSlices = BattlemapPlayerSlices;

/** What the player screen can ask of the DM's window. */
export type BattlemapCommand =
  /** The player screen's width/height ratio, so the DM sees exactly what players see. */
  | { type: 'aspect'; ratio: number }
  /** Arrow keys on the player screen: move the view by a share of the screen. */
  | { type: 'pan'; dx: number; dy: number };

export function isBattlemapCommand(value: unknown): value is BattlemapCommand {
  const command = value as Partial<{ type: string; ratio: unknown; dx: unknown; dy: unknown }> | null;
  if (!command || typeof command !== 'object') {
    return false;
  }
  if (command.type === 'aspect') {
    return typeof command.ratio === 'number' && Number.isFinite(command.ratio) && command.ratio > 0;
  }
  return (
    command.type === 'pan' &&
    typeof command.dx === 'number' &&
    typeof command.dy === 'number' &&
    Math.abs(command.dx) <= 1 &&
    Math.abs(command.dy) <= 1
  );
}
