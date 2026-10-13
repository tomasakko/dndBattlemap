import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { InitiativePanel } from '../initiative-panel/initiative-panel';
import { BattlemapService, MapIcon, MAX_ZOOM, MIN_ZOOM, Point, Room, View, viewRect } from '../services/battlemap.service';
import { InitiativeService } from '../services/initiative.service';
import { AreaEditor } from './area-editor/area-editor';
import { ControlDock } from './control-dock/control-dock';
import type { DockAction, PanelId, PanelState } from './control-dock/control-dock';
import { MapPicker } from './map-picker/map-picker';
import { MapUploadDialog } from './map-upload-dialog/map-upload-dialog';

type Tool = 'draw' | 'view';

const DRAG_THRESHOLD = 4;
const PANEL_SNAP_DISTANCE = 40;
const DEFAULT_PANEL_ORDER: PanelId[] = ['initiative', 'area'];
const ZOOM_STEP = 1.25;
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 720;
const GOLDEN_ANGLE = 137.508;

@Component({
  selector: 'app-dm-screen',
  imports: [InitiativePanel, NgTemplateOutlet, AreaEditor, MapPicker, MapUploadDialog, ControlDock],
  templateUrl: './dm-screen.html',
  styleUrl: './dm-screen.css',
  host: {
    '(window:keydown.escape)': 'cancelDraft()',
    '(window:keydown)': 'onArrowKey($event)',
    '(window:pointermove)': 'onPanelDragMove($event)',
    '(window:pointerup)': 'onPanelDragEnd()',
    '(window:pointercancel)': 'onPanelDragEnd()',
  },
})
export class DmScreen {
  private readonly battlemap = inject(BattlemapService);
  private readonly initiative = inject(InitiativeService);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('board');
  private panelZ = 10;
  private panelDrag: { id: PanelId; startX: number; startY: number; offsetX: number; offsetY: number; width: number; height: number; moved: boolean } | null = null;
  protected readonly snapReady = signal<PanelId | null>(null);
  protected readonly snapEdge = signal<'top' | 'bottom'>('bottom');

  protected readonly panels = signal<Record<PanelId, PanelState>>({
    initiative: { visible: true, floating: false, x: 0, y: 0, z: 10 },
    area: { visible: true, floating: false, x: 0, y: 0, z: 10 },
  });
  private readonly dockedPanelOrder = signal<PanelId[]>([...DEFAULT_PANEL_ORDER]);
  protected readonly panelOrder = this.dockedPanelOrder.asReadonly();
  protected readonly dockWidth = computed(() => {
    const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
    return Math.min(viewportWidth - 16, viewportWidth <= 760 ? 330 : 240);
  });

  protected readonly map = this.battlemap.map;
  protected readonly rooms = this.battlemap.rooms;
  protected readonly tool = signal<Tool>('view');
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
  protected readonly currentMapName = computed(() => this.maps().find((entry) => entry.id === this.currentId())?.name ?? 'Choose Map');
  protected readonly pendingMapFile = signal<File | null>(null);
  protected readonly currentMapIcon = computed(() => {
    const icon = this.maps().find((entry) => entry.id === this.currentId())?.icon;
    return icon === 'city' ? 'location_city' : (icon ?? null);
  });
  protected readonly mapTitle = signal('');
  protected readonly mapIcon = signal<MapIcon>('castle');
  protected readonly sharedId = this.battlemap.sharedId;
  protected readonly locked = this.battlemap.locked;
  protected readonly shareLabel = computed(() =>
    this.shared() ? 'Hide map from players' : this.sharedId() ? 'Show this map to players' : 'Share map with players',
  );
  protected readonly shareDisabled = computed(() => !this.map() || (!this.shared() && !this.battlemap.canShare()));
  protected readonly resizing = signal(false);
  protected readonly initiativeWidth = signal(280);
  protected readonly resizingInitiative = signal(false);
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

  /** Check/undo buttons shown next to the most recently placed point. */
  protected readonly draftActions = computed(() => {
    const points = this.shapeDraft();
    const last = points[points.length - 1];
    if (!last) {
      return null;
    }
    const size = this.handleRadius() * 2.2;
    return { x: last.x, y: last.y, size, canFinish: points.length >= 3 };
  });

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
    this.initiative.startHost();
    const map = this.map();
    if (map) {
      this.fitDmView();
    }
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.error.set('');
    this.pendingMapFile.set(file);
    this.mapTitle.set(file.name.replace(/\.[^.]+$/, '') || 'Map');
    this.mapIcon.set('castle');
  }

  protected setMapIcon(icon: MapIcon): void {
    this.mapIcon.set(icon);
  }

  protected cancelMapUpload(): void {
    this.pendingMapFile.set(null);
  }

  protected async confirmMapUpload(): Promise<void> {
    const file = this.pendingMapFile();
    const name = this.mapTitle().trim();
    if (!file || !name) {
      return;
    }
    try {
      this.error.set('');
      this.cancelDraft();
      await this.battlemap.addMap(file, name, this.mapIcon());
      this.pendingMapFile.set(null);
      this.fitDmView();
    } catch {
      this.pendingMapFile.set(null);
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
    if (event.button === 1) {
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

  protected onArrowKey(event: KeyboardEvent): void {
    const map = this.map();
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[event.key];
    const target = event.target as HTMLElement | null;
    const typing = !!target?.closest('input, select, textarea, [contenteditable], summary');
    if (!map || !step || this.tool() !== 'view' || typing || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    const view = this.view();
    const amount = (event.shiftKey ? 0.1 : 0.02) * map.width / view.zoom;
    this.battlemap.setView({ ...view, cx: view.cx + step[0] * amount, cy: view.cy + step[1] * amount });
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

  protected onDockAction(action: DockAction): void {
    switch (action) {
      case 'share':
        this.toggleShare();
        break;
      case 'fit':
        this.fitDmView();
        break;
      case 'reset':
        this.resetView();
        break;
      case 'initiative':
      case 'area':
        this.togglePanel(action);
        break;
    }
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

  protected togglePanel(id: PanelId): void {
    this.patchPanel(id, { visible: !this.panels()[id].visible });
  }

  protected dockPanel(id: PanelId, edge: 'top' | 'bottom' = 'bottom'): void {
    this.patchPanel(id, { floating: false });
    this.dockedPanelOrder.update((order) => {
      const rest = order.filter((panelId) => panelId !== id);
      return edge === 'top' ? [id, ...rest] : [...rest, id];
    });
  }

  protected raisePanel(id: PanelId): void {
    this.patchPanel(id, { z: ++this.panelZ });
  }

  protected onPanelDragStart(id: PanelId, event: PointerEvent): void {
    const panel = (event.target as HTMLElement).closest<HTMLElement>('.floating-panel, .docked-panel');
    if (!panel || event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.snapReady.set(null);
    const rect = panel.getBoundingClientRect();
    this.panelDrag = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  }

  protected onPanelDragMove(event: PointerEvent): void {
    const drag = this.panelDrag;
    if (!drag) {
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;
    const x = Math.min(window.innerWidth - drag.width, Math.max(0, event.clientX - drag.offsetX));
    const y = Math.min(window.innerHeight - drag.height, Math.max(0, event.clientY - drag.offsetY));
    const near = this.isNearDock(x, y, drag.width, drag.height);
    this.snapReady.set(near ? drag.id : null);
    this.snapEdge.set(near ? this.dockEdge(y + drag.height / 2) : 'bottom');
    this.patchPanel(drag.id, { floating: true, x: Math.round(x), y: Math.round(y), z: ++this.panelZ });
  }

  protected onPanelDragEnd(): void {
    const drag = this.panelDrag;
    if (drag && this.snapReady() === drag.id) {
      this.dockPanel(drag.id, this.snapEdge());
    }
    this.panelDrag = null;
    this.snapReady.set(null);
  }

  /** Dropping on the upper half of the dock puts the panel on top, otherwise below the others. */
  private dockEdge(centerY: number): 'top' | 'bottom' {
    const dock = document.querySelector<HTMLElement>('.control-dock');
    if (!dock) {
      return 'bottom';
    }
    const rect = dock.getBoundingClientRect();
    return centerY < rect.top + rect.height / 2 ? 'top' : 'bottom';
  }

  private isNearDock(x: number, y: number, width: number, height: number): boolean {
    const dock = document.querySelector<HTMLElement>('.control-dock');
    if (!dock) {
      return false;
    }
    const target = dock.getBoundingClientRect();
    const gapX = Math.max(target.left - (x + width), x - target.right, 0);
    const gapY = Math.max(target.top - (y + height), y - target.bottom, 0);
    return Math.hypot(gapX, gapY) <= PANEL_SNAP_DISTANCE;
  }

  private patchPanel(id: PanelId, patch: Partial<PanelState>): void {
    this.panels.update((panels) => ({ ...panels, [id]: { ...panels[id], ...patch } }));
  }

  protected resizeInitiativeBy(delta: number): void {
    this.setInitiativeWidth(this.initiativeWidth() + delta);
  }

  protected resizePanelBy(delta: number): void {
    this.setPanelWidth(this.panelWidth() + delta);
  }

  protected readonly tip = signal<{ text: string; x: number; y: number } | null>(null);

  protected showTip(event: Event): void {
    const el = (event.target as HTMLElement).closest<HTMLElement>('button, a');
    const text = el?.getAttribute('aria-label');
    if (!el || !text) {
      this.tip.set(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    this.tip.set({ text, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom + 6) });
  }

  protected hideTip(): void {
    this.tip.set(null);
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

  protected rename(room: Room, value: string): void {
    const name = value.trim();
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
