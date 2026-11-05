import type { Point, Room } from './model';

const GOLDEN_ANGLE = 137.508;

/** A distinct colour per area, the same on the board and in the Areas list. */
export function roomColor(index: number): string {
  return `hsl(${Math.round((index * GOLDEN_ANGLE) % 360)} 85% 55%)`;
}

export function addRoom(rooms: Room[], id: string, points: Point[]): Room[] {
  return [...rooms, { id, name: `Room ${rooms.length + 1}`, points, revealed: false }];
}

export function patchRoom(rooms: Room[], id: string, patch: Partial<Omit<Room, 'id'>>): Room[] {
  return rooms.map((room) => (room.id === id ? { ...room, ...patch } : room));
}

/** Renames a room; an empty name keeps the old one. */
export function renameRoom(rooms: Room[], id: string, name: string): Room[] {
  const trimmed = name.trim();
  return trimmed ? patchRoom(rooms, id, { name: trimmed }) : rooms;
}

export function toggleRoom(rooms: Room[], id: string): Room[] {
  return rooms.map((room) => (room.id === id ? { ...room, revealed: !room.revealed } : room));
}

export function revealAll(rooms: Room[], revealed: boolean): Room[] {
  return rooms.map((room) => ({ ...room, revealed }));
}

export function removeRoom(rooms: Room[], id: string): Room[] {
  return rooms.filter((room) => room.id !== id);
}

/** Polygon points as an SVG `points` attribute. */
export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Area centroid of a polygon, falling back to the bounding-box centre for degenerate shapes. */
export function centroid(points: Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}
