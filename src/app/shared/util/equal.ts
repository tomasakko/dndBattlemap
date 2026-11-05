/**
 * Structural equality for plain JSON-like data (what the player screen receives).
 * Lets a derived signal skip republishing when its value is rebuilt but unchanged.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
