import { Service, computed, signal } from '@angular/core';
import { booleanPref } from '../../../shared/storage/local-pref';
import { PersistedState } from '../../../shared/storage/persisted-state';
import { newId } from '../../../shared/util/id';
import { loadImageFile } from '../../../shared/util/image';
import type { MarkerStyle } from '../domain/marker-style';
import * as markers from '../domain/markers';
import {
  EMPTY_WORLDMAP,
  WorldmapEntry,
  WorldmapMarker,
  WorldmapState,
  WorldmapView,
  currentWorldmap,
  isValidView,
} from '../domain/model';
import { WORLDMAP_SCHEMA } from '../domain/schema';

const ambiencePref = booleanPref('dnd-worldmap-ambient-animated', true);

/**
 * The Worldmap app's data, and the only copy of it. Saved in the browser (IndexedDB, falling back to
 * localStorage) in the same versioned format as project files.
 */
@Service()
export class WorldmapStore {
  private readonly persisted = PersistedState.browser(WORLDMAP_SCHEMA, 'dnd-worldmap', 'dnd-worldmap');
  private readonly state = signal<WorldmapState>(EMPTY_WORLDMAP);
  private restorePromise?: Promise<void>;

  readonly snapshot = this.state.asReadonly();
  readonly maps = computed(() => this.state().maps);
  readonly currentId = computed(() => this.state().currentId);
  readonly current = computed(() => currentWorldmap(this.state()));
  readonly restored = signal(false);
  readonly persistenceError = signal<string | null>(null);
  /** Where the DM last looked at each map this session. Players follow it; not saved. */
  readonly views = signal<Readonly<Record<string, WorldmapView>>>({});
  /** Whether clouds, birds, leaves and snow drift over the map, on the DM's map and on the player screen. */
  readonly ambientAnimated = signal(ambiencePref.read());
  /** A marker to centre on and open, e.g. picked in the search bar. The DM screen handles and clears it. */
  readonly markerToFocus = signal<string | null>(null);

  ensureRestored(): Promise<void> {
    this.restorePromise ??= this.restore();
    return this.restorePromise;
  }

  replace(state: WorldmapState): void {
    this.commit(state);
  }

  async addMap(file: File, name: string): Promise<void> {
    await this.ensureRestored();
    const image = await loadImageFile(file);
    const entry: WorldmapEntry = { id: newId(), name, image, markers: [] };
    this.commit({ maps: [...this.maps(), entry], currentId: entry.id });
  }

  selectMap(id: string): boolean {
    if (!this.maps().some((entry) => entry.id === id)) {
      return false;
    }
    if (id !== this.currentId()) {
      this.commit({ ...this.state(), currentId: id });
    }
    return true;
  }

  removeMap(id: string): void {
    const maps = this.maps().filter((entry) => entry.id !== id);
    const currentId = this.currentId() === id ? (maps[0]?.id ?? null) : this.currentId();
    this.commit({ maps, currentId });
    this.views.update(({ [id]: _removed, ...rest }) => rest);
  }

  /** Adds a marker on the open map and returns it. */
  addMarker(x: number, y: number): WorldmapMarker | null {
    const id = newId();
    this.updateCurrent((entry) => markers.addMarker(entry, id, x, y));
    return this.current()?.markers.find((marker) => marker.id === id) ?? null;
  }

  moveMarker(id: string, x: number, y: number): void {
    this.updateCurrent((entry) => markers.moveMarker(entry, id, x, y));
  }

  renameMarker(id: string, name: string): void {
    this.updateCurrent((entry) => markers.renameMarker(entry, id, name));
  }

  setMarkerVisibility(id: string, visible: boolean): void {
    this.updateCurrent((entry) => markers.patchMarker(entry, id, { visible }));
  }

  setMarkerStyle(id: string, style: Partial<MarkerStyle>): void {
    this.updateCurrent((entry) => markers.styleMarker(entry, id, style));
  }

  setMarkerBattlemap(id: string, battlemapId: string | null): void {
    this.updateCurrent((entry) => markers.patchMarker(entry, id, { battlemapId }));
  }

  removeMarker(id: string): void {
    this.updateCurrent((entry) => markers.removeMarker(entry, id));
  }

  focusMarker(id: string): void {
    this.markerToFocus.set(id);
  }

  /** Remembers where the DM is looking at a map. */
  setView(mapId: string, view: WorldmapView): void {
    if (isValidView(view)) {
      this.views.update((views) => ({ ...views, [mapId]: view }));
    }
  }

  setAmbientAnimated(animated: boolean): void {
    this.ambientAnimated.set(animated);
    ambiencePref.write(animated);
  }

  async exportState(): Promise<WorldmapState> {
    await this.ensureRestored();
    return this.state();
  }

  private updateCurrent(change: (entry: WorldmapEntry) => WorldmapEntry): void {
    const id = this.currentId();
    this.commit({ ...this.state(), maps: this.maps().map((entry) => (entry.id === id ? change(entry) : entry)) });
  }

  private commit(next: WorldmapState): void {
    this.state.set(next);
    this.persisted.save(next).then(
      () => this.persistenceError.set(null),
      (error: unknown) => {
        console.error('Could not save world maps', error);
        this.persistenceError.set('The world maps could not be saved. They may be lost when you leave this page.');
      },
    );
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
      }
    } catch (error) {
      console.error('Could not restore world maps', error);
      this.persistenceError.set('The saved world maps could not be restored.');
    } finally {
      this.restored.set(true);
    }
  }
}
