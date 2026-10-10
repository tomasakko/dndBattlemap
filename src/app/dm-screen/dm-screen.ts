import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InitiativePanel } from '../initiative-panel/initiative-panel';
import { InitiativeService } from '../initiative.service';
import { BattlemapService, MAX_ZOOM, MIN_ZOOM, Point, Room, View, viewRect } from '../battlemap.service';

type Tool = 'draw' | 'pan' | 'view';

const ZOOM_STEP = 1.25;
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 720;
const GOLDEN_ANGLE = 137.508;

@Component({
  selector: 'app-dm-screen',
  imports: [RouterLink, InitiativePanel],
  templateUrl: './dm-screen.html',
  styleUrl: './dm-screen.css',
  host: {
    '(window:keydown.escape)': 'cancelDraft()',
  },
})
export class DmScreen {
  private readonly battlemap = inject(BattlemapService);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('board');

  protected readonly map = this.battlemap.map;
  protected readonly rooms = this.battlemap.rooms;
  protected readonly tool = signal<Tool>('pan');
  protected readonly shapeDraft = signal<Point[]>([]);
  protected readonly error = signal('');
  protected readonly highlightedId = signal<string | null>(null);

  /** The DM's own zoom/pan. Independent from what the players see. */
  protected readonly dmView = signal<View>({ zoom: 1, cx: 0, cy: 0 });
  protected readonly dragging = signal<'view' | 'pan' | null>(null);

  protected readonly panelWidth = signal(320);
  protected readonly shared = this.battlemap.shared;
  protected readonly maps = this.battlemap.maps;
  protected readonly currentId = this.battlemap.currentId;
  protected readonly sharedId = this.battlemap.sharedId;
  protected readonly locked = this.battlemap.locked;
  protected readonly shareLabel = computed(() =>
    this.shared() ? 'Hide map from players' : this.sharedId() ? 'Show this map to players' : 'Share map with players',
  );
  protected readonly shareDisabled = computed(() => !this.map() || (!this.shared() && !this.battlemap.canShare()));
  protected readonly resizing = signal(false);
  protected readonly initiativeWidth = signal(280);
  protected readonly resizingInitiative = signal(false);
  protected readonly minPanelWidth = MIN_PANEL_WIDTH;
  protected readonly maxPanelWidth = MAX_PANEL_WIDTH;

  protected readonly dmRect = computed(() => {
    const map = this.map();
    if (!map) {
      return null;
    }
    const { zoom, cx, cy } = this.dmView();
    const w = map.width / zoom;
    const h = map.height / zoom;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  });
  protected readonly viewBox = computed(() => {
    const r = this.dmRect();
    return r ? `${r.x} ${r.y} ${r.w} ${r.h}` : '';
  });
  protected readonly dmZoomPercent = computed(() => Math.round(this.dmView().zoom * 100));

  /** Sizes of on-map annotations, kept constant relative to the visible area. */
  protected readonly handleRadius = computed(() => (this.dmRect()?.w ?? 1000) * 0.007);
  protected readonly labelSize = computed(() => (this.dmRect()?.w ?? 1000) * 0.018);

  protected readonly roomViews = computed(() =>
    this.rooms().map((room, index) => {
      const hue = Math.round((index * GOLDEN_ANGLE) % 360);
      const center = centroid(room.points);
      return {
        room,
        index,
        number: index + 1,
        hue,
        color: `hsl(${hue} 85% 55%)`,
        points: toAttr(room.points),
        center,
      };
    }),
  );

  protected readonly draftPoints = computed(() => toAttr(this.shapeDraft()));

  protected readonly revealedCount = computed(() => this.rooms().filter((r) => r.revealed).length);

  protected readonly view = this.battlemap.view;
  protected readonly playerRect = computed(() => {
    const map = this.map();
    return map ? viewRect(map, this.view(), this.battlemap.playerAspect()) : null;
  });
  // The dimmed area outside the player's view; evenodd fill cuts the player rect out of the full map.
  protected readonly dimPath = computed(() => {
    const map = this.map();
    const r = this.playerRect();
    if (!map || !r) {
      return '';
    }
    return `M0 0H${map.width}V${map.height}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`;
  });
  protected readonly zoomPercent = computed(() => Math.round(this.view().zoom * 100));
  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;

  constructor() {
    this.battlemap.startHost();
    inject(InitiativeService).startHost();
    const map = this.map();
    if (map) {
      this.fitDmView();
    }
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      this.error.set('');
      this.cancelDraft();
      await this.battlemap.addMap(file);
      this.fitDmView();
    } catch {
      this.error.set('That file could not be loaded as an image.');
    }
  }

  protected setTool(tool: Tool): void {
    this.cancelDraft();
    this.tool.set(tool);
  }

  protected onBoardPointerDown(event: PointerEvent): void {
    const svg = this.svg()?.nativeElement;
    if (!svg) {
      return;
    }
    if (event.button === 1 || (event.button === 0 && this.tool() === 'pan')) {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      this.panOrigin = { x: event.clientX, y: event.clientY, view: this.dmView(), scale: svg.getScreenCTM()!.a };
      this.dragging.set('pan');
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const point = this.toMapPoint(event);
    switch (this.tool()) {
      case 'view':
        svg.setPointerCapture(event.pointerId);
        this.dragging.set('view');
        this.centerPlayerViewOn(point);
        break;
      case 'draw':
        this.addShapePoint(point);
        break;
    }
  }

  protected onBoardPointerMove(event: PointerEvent): void {
    const dragging = this.dragging();
    if (dragging === 'pan' && this.panOrigin) {
      const o = this.panOrigin;
      this.setDmView({
        ...o.view,
        cx: o.view.cx - (event.clientX - o.x) / o.scale,
        cy: o.view.cy - (event.clientY - o.y) / o.scale,
      });
      return;
    }
    if (dragging === 'view') {
      this.centerPlayerViewOn(this.toMapPoint(event));
    }
  }

  protected onBoardPointerUp(): void {
    if (this.dragging()) {
      this.dragging.set(null);
      this.panOrigin = null;
    }
  }

  /** The mouse wheel zooms the DM's own map, keeping the point under the cursor fixed. */
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const under = this.toMapPoint(event);
    this.zoomDmView(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, under);
  }

  protected selectMap(id: string): void {
    this.cancelDraft();
    this.battlemap.selectMap(id);
    this.fitDmView();
  }

  protected removeMap(id: string, name: string): void {
    if (confirm('Remove the map "' + name + '" and its shapes?')) {
      this.cancelDraft();
      this.battlemap.removeMap(id);
      this.fitDmView();
    }
  }

  protected toggleShare(): void {
    this.battlemap.setShared(!this.shared());
  }

  protected onResizeStart(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.resizing.set(true);
  }

  protected onResizeMove(event: PointerEvent): void {
    if (this.resizing()) {
      this.setPanelWidth(window.innerWidth - event.clientX);
    }
  }

  protected onResizeEnd(): void {
    this.resizing.set(false);
  }

  protected onInitiativeResizeStart(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.resizingInitiative.set(true);
  }

  protected onInitiativeResizeMove(event: PointerEvent): void {
    if (this.resizingInitiative()) {
      this.setInitiativeWidth(event.clientX);
    }
  }

  protected onInitiativeResizeEnd(): void {
    this.resizingInitiative.set(false);
  }

  protected resizeInitiativeBy(delta: number): void {
    this.setInitiativeWidth(this.initiativeWidth() + delta);
  }

  protected resizePanelBy(delta: number): void {
    this.setPanelWidth(this.panelWidth() + delta);
  }

  protected zoomDmBy(factor: number): void {
    this.zoomDmView(factor);
  }

  protected onDmZoomSlider(event: Event): void {
    const zoom = Number((event.target as HTMLInputElement).value);
    this.zoomDmView(zoom / this.dmView().zoom);
  }

  protected fitDmView(): void {
    const map = this.map();
    if (map) {
      this.dmView.set({ zoom: 1, cx: map.width / 2, cy: map.height / 2 });
    }
  }

  protected zoomBy(factor: number): void {
    this.battlemap.setView({ ...this.view(), zoom: this.view().zoom * factor });
  }

  protected onZoomSlider(event: Event): void {
    const zoom = Number((event.target as HTMLInputElement).value);
    this.battlemap.setView({ ...this.view(), zoom });
  }

  protected resetView(): void {
    this.battlemap.resetView();
  }

  protected finishShape(): void {
    const points = this.shapeDraft();
    if (points.length >= 3) {
      this.battlemap.addRoom(points);
    }
    this.shapeDraft.set([]);
  }

  protected undoShapePoint(): void {
    this.shapeDraft.update((points) => points.slice(0, -1));
  }

  protected cancelDraft(): void {
    this.shapeDraft.set([]);
  }

  protected toggle(room: Room): void {
    this.battlemap.toggleRoom(room.id);
  }

  protected remove(room: Room): void {
    this.battlemap.removeRoom(room.id);
  }

  protected rename(room: Room, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    this.battlemap.renameRoom(room.id, name || room.name);
  }

  protected setAll(revealed: boolean): void {
    this.battlemap.setAllRevealed(revealed);
  }

  private panOrigin: { x: number; y: number; view: View; scale: number } | null = null;

  private centerPlayerViewOn(point: Point): void {
    this.battlemap.setView({ ...this.view(), cx: point.x, cy: point.y });
  }

  private zoomDmView(factor: number, anchor?: Point): void {
    const map = this.map();
    if (!map) {
      return;
    }
    const view = this.dmView();
    const zoom = Math.min(MAX_ZOOM * 2, Math.max(MIN_ZOOM, view.zoom * factor));
    const a = anchor ?? { x: view.cx, y: view.cy };
    const ratio = view.zoom / zoom;
    this.setDmView({ zoom, cx: a.x - (a.x - view.cx) * ratio, cy: a.y - (a.y - view.cy) * ratio });
  }

  private setInitiativeWidth(width: number): void {
    this.initiativeWidth.set(Math.round(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width))));
  }

  private setPanelWidth(width: number): void {
    this.panelWidth.set(Math.round(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width))));
  }

  private setDmView(view: View): void {
    const map = this.map();
    if (!map) {
      return;
    }
    const zoom = Math.min(MAX_ZOOM * 2, Math.max(MIN_ZOOM, view.zoom));
    const halfW = map.width / zoom / 2;
    const halfH = map.height / zoom / 2;
    this.dmView.set({
      zoom,
      cx: Math.min(map.width - halfW, Math.max(halfW, view.cx)),
      cy: Math.min(map.height - halfH, Math.max(halfH, view.cy)),
    });
  }

  private addShapePoint(point: Point): void {
    const points = this.shapeDraft();
    const first = points[0];
    const closeDistance = this.handleRadius() * 2;
    if (first && points.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) <= closeDistance) {
      this.finishShape();
    } else {
      this.shapeDraft.set([...points, point]);
    }
  }

  private toMapPoint(event: { clientX: number; clientY: number }): Point {
    const svg = this.svg()!.nativeElement;
    const matrix = svg.getScreenCTM()!.inverse();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }
}

function toAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Area centroid of a polygon, falling back to the bounding-box centre for degenerate shapes. */
function centroid(points: Point[]): Point {
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
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

