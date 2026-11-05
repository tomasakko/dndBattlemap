import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { InitiativePanel } from '../initiative-panel/initiative-panel';
import { PlayerRoster } from '../player-roster/player-roster';
import {
  BattlemapService,
  MAX_ZOOM,
  MIN_ZOOM,
  Point,
  Room,
  View,
  viewRect,
} from '../services/battlemap.service';
import { InitiativeService } from '../services/initiative.service';
import { AreaEditor } from './area-editor/area-editor';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { MapUploadDialog } from '../../../shared/ui/map-upload-dialog/map-upload-dialog';
import { titleFromFileName } from '../../../shared/util/text';
import { WorldmapService } from '../../worldmap/worldmap.service';
import { PlayerWindowService } from '../../../suite/player-window.service';
import { PanelTabsService } from '../../../suite/shell/panel-tabs.service';
import type { PanelTab } from '../../../suite/shell/panel-tabs.service';

/** Toolbar tools; with none chosen, dragging pans the DM's own view. */
type Tool = 'draw' | 'view';

const ZOOM_STEP = 1.25;
const GOLDEN_ANGLE = 137.508;

@Component({
  selector: 'app-dm-screen',
  imports: [InitiativePanel, PlayerRoster, AreaEditor, MapUploadDialog, FileButton],
  templateUrl: './dm-screen.html',
  styleUrl: './dm-screen.css',
  host: {
    '(window:keydown.escape)': 'cancelDraft()',
    '(window:keydown)': 'onArrowKey($event)',
  },
})
export class DmScreen {
  private readonly battlemap = inject(BattlemapService);
  private readonly initiative = inject(InitiativeService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly worldmap = inject(WorldmapService);
  private readonly confirm = inject(ConfirmService);
  private readonly playerWindow = inject(PlayerWindowService);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('board');
  /** The Initiative Tracker docked next to the toolbar, and what it shows. */
  protected readonly trackerOpen = signal(true);
  protected readonly trackerView = signal<'order' | 'players'>('order');
  /** The Areas list on the bottom edge. */
  protected readonly areasOpen = signal(false);

  protected readonly map = this.battlemap.map;
  protected readonly rooms = this.battlemap.rooms;
  protected readonly tool = signal<Tool | null>(null);
  protected readonly shapeDraft = signal<Point[]>([]);
  protected readonly error = signal('');
  protected readonly persistenceError = this.battlemap.persistenceError;
  protected readonly highlightedId = signal<string | null>(null);

  /** The DM's own zoom/pan. Independent from what the players see. */
  protected readonly dmView = signal<View>({ zoom: 1, cx: 0, cy: 0 });
  protected readonly dragging = signal<'view' | 'pan' | null>(null);

  protected readonly shared = this.battlemap.shared;
  protected readonly initiativeShared = this.initiative.shared;
  protected readonly maps = this.battlemap.maps;
  protected readonly currentId = this.battlemap.currentId;
  protected readonly pendingMapFile = signal<File | null>(null);
  protected readonly mapTabs = computed<PanelTab[]>(() =>
    this.maps().map((entry) => ({
      id: entry.id,
      label: entry.name,
      ...(entry.id === this.sharedId() ? { note: 'shown to players' } : {}),
    })),
  );
  protected readonly mapTitle = signal('');
  protected readonly sharedId = this.battlemap.sharedId;
  protected readonly locked = this.battlemap.locked;
  protected readonly shareLabel = computed(() =>
    this.shared()
      ? 'Hide map from players'
      : this.sharedId()
        ? 'Show this map to players'
        : 'Share map with players',
  );
  protected readonly shareDisabled = computed(
    () => !this.map() || (!this.shared() && !this.battlemap.canShare()),
  );
  protected readonly initiativeShareLabel = computed(() =>
    this.initiativeShared()
      ? 'Hide initiative tracker from players'
      : 'Show initiative tracker to players',
  );

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
  /** How far along the zoom slider is, for the darker part of its track. */
  protected readonly zoomFill = computed(
    () => (((this.view().zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100).toFixed(1) + '%',
  );
  /** Short instruction while a tool is active. */
  protected readonly dragHint = computed(() => {
    switch (this.tool()) {
      case 'draw':
        return this.shapeDraft().length === 0
          ? 'Click on the map to start an area'
          : 'Click to add corners; click the first corner to finish';
      case 'view':
        return 'Drag on the map to move the player view';
      default:
        return null;
    }
  });
  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;

  constructor() {
    inject(PanelTabsService).register({
      appId: 'battlemap',
      ariaLabel: 'Battlemaps',
      tabs: this.mapTabs,
      currentId: this.currentId,
      removeLabel: 'Delete map ',
      locked: this.locked,
      lockedNote: 'End combat to switch maps.',
      select: (id) => this.selectMap(id),
      remove: (tab) => void this.removeMap(tab.id, tab.label),
    });
    this.battlemap.startHost();
    this.initiative.startHost();
    this.worldmap.startHost();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const linkedMapId = params.get('linkedMapId');
      if (linkedMapId) {
        this.worldmap.showLinkedBattlemap(linkedMapId);
        this.battlemap.openLinkedMap(linkedMapId);
      } else {
        this.worldmap.clearLinkedBattlemap();
        this.battlemap.clearLinkedPlayerMap();
      }
    });
    const map = this.map();
    if (map) {
      this.fitDmView();
    }
    effect(() => {
      if (this.battlemap.importCount() > 0) {
        untracked(() => {
          this.cancelDraft();
          this.fitDmView();
        });
      }
    });
  }

  protected onFileSelected(file: File): void {
    this.error.set('');
    this.pendingMapFile.set(file);
    this.mapTitle.set(titleFromFileName(file.name, 'Map'));
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
      await this.battlemap.addMap(file, name);
      this.pendingMapFile.set(null);
      this.fitDmView();
    } catch {
      this.pendingMapFile.set(null);
      this.error.set('That file could not be loaded as an image.');
    }
  }

  /** Picking the active tool again puts it away. */
  protected toggleTool(tool: Tool): void {
    this.cancelDraft();
    this.tool.update((current) => (current === tool ? null : tool));
  }

  protected toggleTracker(): void {
    this.trackerOpen.update((open) => !open);
  }

  protected toggleInitiativeShared(): void {
    this.battlemap.setInitiativeShared(!this.initiativeShared());
  }

  protected onBoardPointerDown(event: PointerEvent): void {
    const svg = this.svg()?.nativeElement;
    if (!svg) {
      return;
    }
    // Middle mouse always pans; so does the left button while no tool is chosen.
    if (event.button === 1 || (event.button === 0 && this.tool() === null)) {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      this.panOrigin = {
        x: event.clientX,
        y: event.clientY,
        view: this.dmView(),
        scale: svg.getScreenCTM()!.a,
      };
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
    if (
      !map ||
      !step ||
      this.tool() !== 'view' ||
      typing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    event.preventDefault();
    const view = this.view();
    const amount = ((event.shiftKey ? 0.1 : 0.02) * map.width) / view.zoom;
    this.battlemap.setView({
      ...view,
      cx: view.cx + step[0] * amount,
      cy: view.cy + step[1] * amount,
    });
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

  protected async removeMap(id: string, name: string): Promise<void> {
    if (await this.confirm.ask('Remove the map "' + name + '" and its shapes?')) {
      this.cancelDraft();
      this.battlemap.removeMap(id);
      this.fitDmView();
    }
  }

  /**
   * Sharing the map also opens the player screen, or switches it over from the world map.
   * Players see one app at a time, so the world map stops being shown and its eye turns off.
   */
  protected toggleShare(): void {
    const show = !this.shared();
    this.battlemap.setShared(show);
    if (show && this.shared()) {
      this.worldmap.setShared(false);
      this.playerWindow.show('battlemap');
    }
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
    if (
      first &&
      points.length >= 3 &&
      Math.hypot(point.x - first.x, point.y - first.y) <= closeDistance
    ) {
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
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}
