import { Signal, computed, signal } from '@angular/core';
import type { MapImage, Point, View } from '../../domain/model';
import { DM_MAX_ZOOM, clampView, fitView, mapRatio, viewBoxFor, viewRect, zoomAround } from '../../domain/viewport';

/** How much one wheel notch zooms the DM's board. */
const ZOOM_STEP = 1.25;

/**
 * The DM's own zoom and pan of the board, independent from what the players see.
 * Owns the drag-to-pan gesture; the maths lives in `domain/viewport`.
 */
export class BoardViewport {
  readonly view = signal<View>({ zoom: 1, cx: 0, cy: 0 });
  readonly panning = signal(false);
  readonly rect = computed(() => {
    const map = this.map();
    return map ? viewRect(map, this.view(), mapRatio(map)) : null;
  });
  readonly viewBox = computed(() => {
    const rect = this.rect();
    return rect ? viewBoxFor(rect) : '';
  });

  private panOrigin: { x: number; y: number; view: View; scale: number } | null = null;

  constructor(private readonly map: Signal<MapImage | null>) {}

  fit(): void {
    const map = this.map();
    if (map) {
      this.view.set(fitView(map));
    }
  }

  /** One wheel notch in (`direction` 1) or out (-1), keeping `anchor` under the cursor. */
  zoomStep(direction: 1 | -1, anchor: Point): void {
    this.set(zoomAround(this.view(), direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP, anchor, DM_MAX_ZOOM));
  }

  /** `scale`: screen pixels per map unit at the start of the drag. */
  startPan(clientX: number, clientY: number, scale: number): void {
    this.panOrigin = { x: clientX, y: clientY, view: this.view(), scale };
    this.panning.set(true);
  }

  movePan(clientX: number, clientY: number): void {
    const o = this.panOrigin;
    if (o) {
      this.set({ ...o.view, cx: o.view.cx - (clientX - o.x) / o.scale, cy: o.view.cy - (clientY - o.y) / o.scale });
    }
  }

  endPan(): void {
    this.panOrigin = null;
    this.panning.set(false);
  }

  private set(view: View): void {
    const map = this.map();
    if (map) {
      this.view.set(clampView(map, view, mapRatio(map), DM_MAX_ZOOM));
    }
  }
}
