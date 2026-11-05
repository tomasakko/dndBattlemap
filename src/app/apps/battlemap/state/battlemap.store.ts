import { Service, computed, signal } from '@angular/core';
import { PersistedState } from '../../../shared/storage/persisted-state';
import { newId } from '../../../shared/util/id';
import { loadImageFile } from '../../../shared/util/image';
import {
  BattlemapState,
  EMPTY_BATTLEMAP,
  EMPTY_INITIATIVE,
  MapEntry,
  Point,
  View,
  currentMap,
} from '../domain/model';
import * as rooms from '../domain/rooms';
import { BATTLEMAP_SCHEMA } from '../domain/schema';
import { clampView, fitView } from '../domain/viewport';

/** View changes (e.g. dragging) are saved once they settle; serialising every map image is expensive. */
const SAVE_SOON_MS = 400;

/**
 * The Battlemap app's data, and the only copy of it. Everything else (the DM screen, the initiative tracker,
 * the sidebar, search, the player view) reads from here, so nothing can go stale.
 */
@Service()
export class BattlemapStore {
  private readonly persisted = PersistedState.browser(BATTLEMAP_SCHEMA, 'dnd-battlemap', 'dnd-battlemap');
  private readonly state = signal<BattlemapState>(EMPTY_BATTLEMAP);
  private restorePromise?: Promise<void>;

  readonly snapshot = this.state.asReadonly();
  readonly maps = computed(() => this.state().maps);
  readonly players = computed(() => this.state().players);
  readonly currentId = computed(() => this.state().currentId);
  readonly current = computed(() => currentMap(this.state()));
  /** Maps can't be switched or deleted while a fight is running. */
  readonly locked = computed(() => this.current()?.initiative.activeId != null);
  /** Width/height ratio of the player screen, as it reports it. Not saved. */
  readonly playerAspect = signal(16 / 9);
  readonly restored = signal(false);
  readonly persistenceError = signal<string | null>(null);
  /** Increments whenever loaded data replaces the current data, so open screens can reset their tools. */
  readonly replacedCount = signal(0);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => void this.persisted.flush());
    }
  }

  /** Loads the saved data once, before a screen or the project tools use it. */
  ensureRestored(): Promise<void> {
    this.restorePromise ??= this.restore();
    return this.restorePromise;
  }

  /** Replaces all data, e.g. from a project file. */
  replace(state: BattlemapState): void {
    this.commit(state);
    this.replacedCount.update((n) => n + 1);
  }

  async addMap(file: File, name: string): Promise<void> {
    await this.ensureRestored();
    const map = await loadImageFile(file);
    const entry: MapEntry = { id: newId(), name, map, rooms: [], view: fitView(map), initiative: EMPTY_INITIATIVE };
    this.commit({ ...this.state(), maps: [...this.maps(), entry], currentId: entry.id });
  }

  /** Switches the map the DM is working on. Returns false while a fight on the open map is running. */
  selectMap(id: string): boolean {
    if (id === this.currentId()) {
      return true;
    }
    if (this.locked() || !this.maps().some((m) => m.id === id)) {
      return false;
    }
    this.commit({ ...this.state(), currentId: id });
    return true;
  }

  removeMap(id: string): boolean {
    if (this.locked()) {
      return false;
    }
    const maps = this.maps().filter((m) => m.id !== id);
    const currentId = this.currentId() === id ? (maps[0]?.id ?? null) : this.currentId();
    this.commit({ ...this.state(), maps, currentId });
    return true;
  }

  updateMap(id: string, change: (entry: MapEntry) => MapEntry, options: { soon?: boolean } = {}): void {
    this.commit(
      { ...this.state(), maps: this.maps().map((entry) => (entry.id === id ? change(entry) : entry)) },
      options,
    );
  }

  updateCurrent(change: (entry: MapEntry) => MapEntry): void {
    const id = this.currentId();
    if (id) {
      this.updateMap(id, change);
    }
  }

  /** Sets what the players see of a map (default: the open one), kept within the map and the zoom limits. */
  setView(view: View, mapId = this.currentId()): void {
    const entry = this.maps().find((m) => m.id === mapId);
    if (entry) {
      const clamped = clampView(entry.map, view, this.playerAspect());
      this.updateMap(entry.id, (e) => ({ ...e, view: clamped }), { soon: true });
    }
  }

  resetView(mapId = this.currentId()): void {
    const entry = this.maps().find((m) => m.id === mapId);
    if (entry) {
      this.setView(fitView(entry.map), entry.id);
    }
  }

  addRoom(points: Point[]): void {
    this.updateCurrent((entry) => ({ ...entry, rooms: rooms.addRoom(entry.rooms, newId(), points) }));
  }

  renameRoom(id: string, name: string): void {
    this.updateCurrent((entry) => ({ ...entry, rooms: rooms.renameRoom(entry.rooms, id, name) }));
  }

  toggleRoom(id: string): void {
    this.updateCurrent((entry) => ({ ...entry, rooms: rooms.toggleRoom(entry.rooms, id) }));
  }

  setAllRevealed(revealed: boolean): void {
    this.updateCurrent((entry) => ({ ...entry, rooms: rooms.revealAll(entry.rooms, revealed) }));
  }

  removeRoom(id: string): void {
    this.updateCurrent((entry) => ({ ...entry, rooms: rooms.removeRoom(entry.rooms, id) }));
  }

  updatePlayers(change: (players: BattlemapState['players']) => BattlemapState['players']): void {
    this.commit({ ...this.state(), players: change(this.players()) });
  }

  /** All data, once the saved data has been loaded. */
  async exportState(): Promise<BattlemapState> {
    await this.ensureRestored();
    return this.state();
  }

  private commit(next: BattlemapState, options: { soon?: boolean } = {}): void {
    this.state.set(next);
    if (options.soon) {
      this.persisted.saveSoon(() => this.state(), SAVE_SOON_MS, (error) => this.saveResult(error));
    } else {
      this.persisted.save(next).then(
        () => this.saveResult(null),
        (error: unknown) => this.saveResult(error),
      );
    }
  }

  private saveResult(error: unknown): void {
    if (error) {
      console.error('Could not save battlemap state', error);
      this.persistenceError.set('Battlemap data could not be saved. It may be lost when you leave this page.');
    } else {
      this.persistenceError.set(null);
    }
  }

  private async restore(): Promise<void> {
    if (typeof window === 'undefined') {
      this.restored.set(true);
      return;
    }
    try {
      const saved = await this.persisted.load();
      if (saved) {
        this.state.set(saved);
        this.replacedCount.update((n) => n + 1);
      }
    } catch (error) {
      console.error('Could not restore battlemap state', error);
      this.persistenceError.set('Saved battlemap data could not be restored.');
    } finally {
      this.restored.set(true);
    }
  }
}
