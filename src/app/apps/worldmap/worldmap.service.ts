import { Service, computed, signal } from '@angular/core';
import { IndexedDbStore, SaveQueue } from '../../shared/storage/indexed-db-store';
import { newId } from '../../shared/util/id';
import { loadImageFile } from '../../shared/util/image';

export interface WorldmapImage {
  url: string;
  width: number;
  height: number;
}

/** A pin on a world map. Coordinates are image pixels, measured from the top-left corner. */
export interface WorldmapMarker {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** A world map with its own markers, so switching maps never carries markers over. */
export interface WorldmapEntry {
  id: string;
  name: string;
  image: WorldmapImage;
  markers: WorldmapMarker[];
}

export interface WorldmapState {
  maps: WorldmapEntry[];
  currentId: string | null;
}

const store = new IndexedDbStore('dnd-worldmap');

const EMPTY_STATE: WorldmapState = { maps: [], currentId: null };

/** Holds the world maps and their markers, and keeps them in IndexedDB so they survive leaving the page. */
@Service()
export class WorldmapService {
  readonly state = signal<WorldmapState>(EMPTY_STATE);
  readonly maps = computed(() => this.state().maps);
  readonly currentId = computed(() => this.state().currentId);
  readonly current = computed(() => this.state().maps.find((entry) => entry.id === this.state().currentId) ?? null);
  readonly persistenceError = signal<string | null>(null);

  private restorePromise?: Promise<void>;
  private readonly saves = new SaveQueue();

  ensureRestored(): Promise<void> {
    this.restorePromise ??= this.restore();
    return this.restorePromise;
  }

  async addMap(file: File, name: string): Promise<void> {
    await this.ensureRestored();
    const image = await loadImageFile(file);
    const entry: WorldmapEntry = { id: newId(), name, image, markers: [] };
    this.state.update((state) => ({ maps: [...state.maps, entry], currentId: entry.id }));
    await this.persist();
  }

  selectMap(id: string): void {
    if (id === this.currentId() || !this.maps().some((entry) => entry.id === id)) {
      return;
    }
    this.state.update((state) => ({ ...state, currentId: id }));
    void this.persist();
  }

  removeMap(id: string): void {
    this.state.update((state) => {
      const maps = state.maps.filter((entry) => entry.id !== id);
      return { maps, currentId: state.currentId === id ? (maps[0]?.id ?? null) : state.currentId };
    });
    void this.persist();
  }

  addMarker(x: number, y: number): WorldmapMarker | null {
    const current = this.current();
    if (!current) {
      return null;
    }
    const marker: WorldmapMarker = {
      id: newId(),
      name: `Marker ${current.markers.length + 1}`,
      x,
      y,
    };
    this.updateCurrent((entry) => ({ ...entry, markers: [...entry.markers, marker] }));
    return marker;
  }

  moveMarker(id: string, x: number, y: number): void {
    this.patchMarker(id, { x, y });
  }

  renameMarker(id: string, name: string): void {
    this.patchMarker(id, { name: name.trim() || 'Marker' });
  }

  removeMarker(id: string): void {
    this.updateCurrent((entry) => ({ ...entry, markers: entry.markers.filter((marker) => marker.id !== id) }));
  }

  exportState(): WorldmapState {
    return this.state();
  }

  /** Replaces all world maps with the given saved state. Throws if it isn't valid. */
  importState(saved: unknown): void {
    this.state.set(validate(saved));
    void this.persist();
  }

  private patchMarker(id: string, patch: Partial<WorldmapMarker>): void {
    this.updateCurrent((entry) => ({
      ...entry,
      markers: entry.markers.map((marker) => (marker.id === id ? { ...marker, ...patch } : marker)),
    }));
  }

  private updateCurrent(change: (entry: WorldmapEntry) => WorldmapEntry): void {
    const id = this.currentId();
    this.state.update((state) => ({
      ...state,
      maps: state.maps.map((entry) => (entry.id === id ? change(entry) : entry)),
    }));
    void this.persist();
  }

  private persist(): Promise<void> {
    const serialised = JSON.stringify(this.state());
    return this.saves.enqueue(
      () => store.write(serialised),
      () => this.persistenceError.set(null),
      (error) => {
        console.error('Could not save world maps', error);
        this.persistenceError.set('The world maps could not be saved. They may be lost when you leave this page.');
      },
    );
  }

  private async restore(): Promise<void> {
    if (!store.available) {
      return;
    }
    try {
      const raw = await store.read();
      if (raw) {
        this.state.set(validate(JSON.parse(raw)));
      }
    } catch (error) {
      console.error('Could not restore world maps', error);
      this.persistenceError.set('The saved world maps could not be restored.');
    }
  }
}

function validateMarkers(markers: unknown): WorldmapMarker[] {
  if (
    !Array.isArray(markers) ||
    !markers.every(
      (m) =>
        m && typeof m.id === 'string' && typeof m.name === 'string' && Number.isFinite(m.x) && Number.isFinite(m.y),
    )
  ) {
    throw new Error('Invalid world map markers');
  }
  return markers.map(({ id, name, x, y }) => ({ id, name, x, y }));
}

function validateEntry(saved: unknown, fallbackId: string): WorldmapEntry {
  const data = saved as Partial<WorldmapEntry> | null;
  const image = data?.image;
  if (!data || !image || typeof image.url !== 'string' || !(image.width > 0) || !(image.height > 0)) {
    throw new Error('Invalid world map image');
  }
  return {
    id: typeof data.id === 'string' && data.id ? data.id : fallbackId,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'World map',
    image: { url: image.url, width: image.width, height: image.height },
    markers: validateMarkers(data.markers ?? []),
  };
}

function validate(saved: unknown): WorldmapState {
  const data = saved as { maps?: unknown; currentId?: unknown; image?: unknown } | null;
  if (!data || typeof data !== 'object') {
    throw new Error('No world map in file');
  }
  // Saves from before multiple maps held a single map (or none) directly on the state.
  if (!('maps' in data)) {
    if (!data.image) {
      return EMPTY_STATE;
    }
    const entry = validateEntry(data, newId());
    return { maps: [entry], currentId: entry.id };
  }
  if (!Array.isArray(data.maps)) {
    throw new Error('Invalid world maps');
  }
  const maps = data.maps.map((entry) => validateEntry(entry, newId()));
  if (new Set(maps.map((entry) => entry.id)).size !== maps.length) {
    throw new Error('Duplicate world map ids');
  }
  return {
    maps,
    currentId: maps.some((entry) => entry.id === data.currentId) ? (data.currentId as string) : (maps[0]?.id ?? null),
  };
}
