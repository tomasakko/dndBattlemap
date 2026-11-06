import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { MapUploadDialog } from '../../../shared/ui/map-upload-dialog/map-upload-dialog';
import { titleFromFileName } from '../../../shared/util/text';
import { PlayerStageService } from '../../../suite/presentation/player-stage.service';
import { PanelTabsService } from '../../../suite/shell/panel-tabs.service';
import type { Point, Room } from '../domain/model';
import { centroid, pointsAttr, roomColor } from '../domain/rooms';
import { MAX_ZOOM, MIN_ZOOM, dimPath, viewRect } from '../domain/viewport';
import { InitiativePanel } from '../initiative-panel/initiative-panel';
import { PlayerRoster } from '../player-roster/player-roster';
import { BattlemapStore } from '../state/battlemap.store';
import { InitiativeService } from '../state/initiative.service';
import { battlemapMaps } from '../suite/battlemap.sidebar';
import { AreaEditor } from './area-editor/area-editor';
import { AreaDraft } from './board/area-draft';
import { BoardViewport } from './board/board-viewport';

/** Toolbar tools; with none chosen, dragging pans the DM's own view. */
type Tool = 'draw' | 'view';

const APP_ID = 'battlemap';

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
  private readonly store = inject(BattlemapStore);
  private readonly initiative = inject(InitiativeService);
  private readonly stage = inject(PlayerStageService);
  private readonly confirm = inject(ConfirmService);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('board');

  /** The Initiative Tracker docked next to the toolbar, and what it shows. */
  protected readonly trackerOpen = signal(true);
  protected readonly trackerView = signal<'order' | 'players'>('order');
  /** The Areas list on the bottom edge. */
  protected readonly areasOpen = signal(false);

  protected readonly map = computed(() => this.store.current()?.map ?? null);
  protected readonly rooms = computed(() => this.store.current()?.rooms ?? []);
  /** What the players see of the open map. */
  protected readonly view = computed(() => this.store.current()?.view ?? { zoom: 1, cx: 0, cy: 0 });
  protected readonly tool = signal<Tool | null>(null);
  protected readonly error = signal('');
  protected readonly persistenceError = this.store.persistenceError;
  protected readonly highlightedId = signal<string | null>(null);
  protected readonly dragging = signal<'view' | 'pan' | null>(null);

  private readonly board = new BoardViewport(this.map);
  private readonly draft = new AreaDraft();
  protected readonly viewBox = this.board.viewBox;
  protected readonly shapeDraft = this.draft.points;
  protected readonly draftPoints = this.draft.pointsAttr;

  protected readonly initiativeShared = this.initiative.shared;
  protected readonly pendingMapFile = signal<File | null>(null);
  protected readonly mapTitle = signal('');
  protected readonly locked = this.store.locked;
  /** Players see the open map. */
  protected readonly shared = computed(() => this.stage.isShowing(APP_ID, this.store.currentId(), 'shared'));
  /** Players see another battlemap. */
  private readonly otherShared = computed(() => this.stage.isShowing(APP_ID) && !this.shared());
  protected readonly shareLabel = computed(() =>
    this.shared() ? 'Hide map from players' : this.otherShared() ? 'Show this map to players' : 'Share map with players',
  );
  /** During a fight the DM can't move the players to another map. */
  protected readonly shareDisabled = computed(() => !this.map() || (!this.shared() && this.otherShared() && this.locked()));
  protected readonly initiativeShareLabel = computed(() =>
    this.initiativeShared() ? 'Hide initiative tracker from players' : 'Show initiative tracker to players',
  );

  /** Sizes of on-map annotations, kept constant relative to the visible area. */
  protected readonly handleRadius = computed(() => (this.board.rect()?.w ?? 1000) * 0.007);
  protected readonly labelSize = computed(() => (this.board.rect()?.w ?? 1000) * 0.018);

  protected readonly roomViews = computed(() =>
    this.rooms().map((room, index) => ({
      room,
      index,
      number: index + 1,
      color: roomColor(index),
      points: pointsAttr(room.points),
      center: centroid(room.points),
    })),
  );

  /** Check/undo buttons shown next to the most recently placed point. */
  protected readonly draftActions = computed(() => {
    const points = this.draft.points();
    const last = points[points.length - 1];
    return last ? { x: last.x, y: last.y, size: this.handleRadius() * 2.2, canFinish: this.draft.canFinish() } : null;
  });

  protected readonly revealedCount = computed(() => this.rooms().filter((r) => r.revealed).length);

  protected readonly playerRect = computed(() => {
    const map = this.map();
    return map ? viewRect(map, this.view(), this.store.playerAspect()) : null;
  });
  /** The dimmed area outside the player's view. */
  protected readonly dimPath = computed(() => {
    const map = this.map();
    const rect = this.playerRect();
    return map && rect ? dimPath(map, rect) : '';
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
        return this.draft.points().length === 0
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
    inject(PanelTabsService).register({ appId: APP_ID, ...battlemapMaps(() => this.cancelDraft()) });
    // A different map (switched, loaded from a project, …) starts fully in view with no half-drawn area.
    effect(() => {
      this.store.currentId();
      this.store.replacedCount();
      untracked(() => {
        this.draft.cancel();
        this.board.fit();
      });
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
      await this.store.addMap(file, name);
    } catch {
      this.error.set('That file could not be loaded as an image.');
    } finally {
      this.pendingMapFile.set(null);
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
    this.initiative.setShared(!this.initiativeShared());
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
      this.board.startPan(event.clientX, event.clientY, svg.getScreenCTM()?.a ?? 1);
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
    if (dragging === 'pan') {
      this.board.movePan(event.clientX, event.clientY);
    } else if (dragging === 'view') {
      this.centerPlayerViewOn(this.toMapPoint(event));
    }
  }

  protected onBoardPointerUp(): void {
    this.board.endPan();
    this.dragging.set(null);
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
    const amount = ((event.shiftKey ? 0.1 : 0.02) * map.width) / view.zoom;
    this.store.setView({ ...view, cx: view.cx + step[0] * amount, cy: view.cy + step[1] * amount });
  }

  /** The mouse wheel zooms the DM's own map, keeping the point under the cursor fixed. */
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.board.zoomStep(event.deltaY < 0 ? 1 : -1, this.toMapPoint(event));
  }

  /**
   * Shows the open map to the players (opening their window if needed), or hides it.
   * Players see one thing at a time, so this replaces whatever they saw.
   */
  protected toggleShare(): void {
    const id = this.store.currentId();
    if (this.shared()) {
      this.stage.hide();
    } else if (id && !this.shareDisabled()) {
      this.stage.present({ app: APP_ID, mapId: id, mode: 'shared' }, { openWindow: true });
    }
  }

  protected fitDmView(): void {
    this.board.fit();
  }

  protected onZoomSlider(event: Event): void {
    const zoom = Number((event.target as HTMLInputElement).value);
    this.store.setView({ ...this.view(), zoom });
  }

  protected resetView(): void {
    this.store.resetView();
  }

  protected finishShape(): void {
    const points = this.draft.finish();
    if (points) {
      this.store.addRoom(points);
    }
  }

  protected undoShapePoint(): void {
    this.draft.undo();
  }

  protected cancelDraft(): void {
    this.draft.cancel();
  }

  protected toggle(room: Room): void {
    this.store.toggleRoom(room.id);
    this.shareIfLinked();
  }

  protected remove(room: Room): void {
    this.store.removeRoom(room.id);
  }

  protected rename(room: Room, value: string): void {
    this.store.renameRoom(room.id, value);
  }

  protected setAll(revealed: boolean): void {
    this.store.setAllRevealed(revealed);
    this.shareIfLinked();
  }

  /**
   * A quick look from a world map link keeps every area covered. Revealing or hiding areas on that map
   * means the DM is now running it, so it becomes a normal share and players see the areas change.
   */
  private shareIfLinked(): void {
    const id = this.store.currentId();
    if (id && this.stage.isShowing(APP_ID, id, 'linked')) {
      this.stage.present({ app: APP_ID, mapId: id, mode: 'shared' });
    }
  }

  private centerPlayerViewOn(point: Point): void {
    this.store.setView({ ...this.view(), cx: point.x, cy: point.y });
  }

  private addShapePoint(point: Point): void {
    const finished = this.draft.add(point, this.handleRadius() * 2);
    if (finished) {
      this.store.addRoom(finished);
    }
  }

  private toMapPoint(event: { clientX: number; clientY: number }): Point {
    const svg = this.svg()?.nativeElement;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!matrix) {
      return { x: 0, y: 0 };
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }
}
