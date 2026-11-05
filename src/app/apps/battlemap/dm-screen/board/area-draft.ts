import { computed, signal } from '@angular/core';
import type { Point } from '../../domain/model';
import { pointsAttr } from '../../domain/rooms';

/** A polygon needs at least this many corners. */
const MIN_CORNERS = 3;

/** The area being drawn: corners placed so far, and when it may be finished. */
export class AreaDraft {
  readonly points = signal<Point[]>([]);
  readonly pointsAttr = computed(() => pointsAttr(this.points()));
  readonly canFinish = computed(() => this.points().length >= MIN_CORNERS);

  /**
   * Adds a corner. Clicking within `closeDistance` of the first corner closes the shape instead:
   * the finished polygon is returned and the draft starts over.
   */
  add(point: Point, closeDistance: number): Point[] | null {
    const points = this.points();
    const first = points[0];
    if (first && this.canFinish() && Math.hypot(point.x - first.x, point.y - first.y) <= closeDistance) {
      return this.finish();
    }
    this.points.set([...points, point]);
    return null;
  }

  /** The finished polygon, or null if it has too few corners. Either way the draft starts over. */
  finish(): Point[] | null {
    const points = this.canFinish() ? this.points() : null;
    this.cancel();
    return points;
  }

  undo(): void {
    this.points.update((points) => points.slice(0, -1));
  }

  cancel(): void {
    this.points.set([]);
  }
}
