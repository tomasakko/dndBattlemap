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
  visible: boolean;
  icon: WorldmapMarkerIcon;
  iconColor: string;
  borderColor: string;
  battlemapId: string | null;
}

export type WorldmapMarkerIcon = 'castle' | 'tower' | 'forest' | 'city' | 'cave';

export const WORLDMAP_MARKER_ICONS: {
  id: WorldmapMarkerIcon;
  label: string;
  asset: string;
}[] = [
  { id: 'castle', label: 'Castle', asset: 'castle.svg' },
  { id: 'tower', label: 'Watchtower', asset: 'watchtower.svg' },
  { id: 'forest', label: 'Forest', asset: 'forest.svg' },
  { id: 'city', label: 'Village', asset: 'village.svg' },
  { id: 'cave', label: 'Cave', asset: 'mountain-cave.svg' },
];

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

export interface WorldmapView {
  centerX: number;
  centerY: number;
  zoom: number;
}

const store = new IndexedDbStore('dnd-worldmap');

const EMPTY_STATE: WorldmapState = { maps: [], currentId: null };
const DEFAULT_VIEW: WorldmapView = { centerX: 0.5, centerY: 0.5, zoom: 1 };

/** Holds the world maps and their markers, and keeps them in IndexedDB so they survive leaving the page. */
@Service()
export class WorldmapService {
  readonly state = signal<WorldmapState>(EMPTY_STATE);
  readonly maps = computed(() => this.state().maps);
  readonly currentId = computed(() => this.state().currentId);
  readonly current = computed(
    () => this.state().maps.find((entry) => entry.id === this.state().currentId) ?? null,
  );
  readonly playerMap = signal<WorldmapEntry | null>(null);
  readonly playerView = signal(DEFAULT_VIEW);
  readonly linkedBattlemapId = signal<string | null>(null);
  readonly persistenceError = signal<string | null>(null);

  private channel?: BroadcastChannel;
  private hostViewMapId: string | null = null;
  private hostView = DEFAULT_VIEW;
  private readonly views = new Map<string, WorldmapView>();
  private restorePromise?: Promise<void>;
  private readonly saves = new SaveQueue();

  startHost(): void {
    void this.ensureRestored().then(() => {
      this.open((message) => {
        if (message.type === 'request') {
          this.broadcastCurrent();
        }
      });
      this.broadcastCurrent();
    });
  }

  startViewer(): void {
    this.open((message) => {
      if (message.type === 'current') {
        this.playerMap.set(message.map ? { ...message.map, markers: [] } : null);
        this.playerView.set(message.view);
        this.linkedBattlemapId.set(message.linkedBattlemapId);
      } else if (message.type === 'markers') {
        const current = this.playerMap();
        if (current?.id === message.mapId) {
          this.playerMap.set({ ...current, markers: message.markers });
        }
      } else if (message.type === 'view') {
        if (this.playerMap()?.id === message.mapId) {
          this.playerView.set(message.view);
        }
      } else if (message.type === 'linked-battlemap') {
        this.linkedBattlemapId.set(message.battlemapId);
      }
    });
    this.channel?.postMessage({ type: 'request' } satisfies WorldmapMessage);
  }

  ensureRestored(): Promise<void> {
    this.restorePromise ??= this.restore();
    return this.restorePromise;
  }

  async addMap(file: File, name: string): Promise<void> {
    await this.ensureRestored();
    const image = await loadImageFile(file);
    const entry: WorldmapEntry = { id: newId(), name, image, markers: [] };
    this.state.update((state) => ({ maps: [...state.maps, entry], currentId: entry.id }));
    this.broadcastCurrent();
    await this.persist();
  }

  selectMap(id: string): void {
    if (id === this.currentId() || !this.maps().some((entry) => entry.id === id)) {
      return;
    }
    this.state.update((state) => ({ ...state, currentId: id }));
    this.broadcastCurrent();
    void this.persist();
  }

  removeMap(id: string): void {
    const wasCurrent = id === this.currentId();
    this.state.update((state) => {
      const maps = state.maps.filter((entry) => entry.id !== id);
      return { maps, currentId: state.currentId === id ? (maps[0]?.id ?? null) : state.currentId };
    });
    if (wasCurrent) {
      this.broadcastCurrent();
    }
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
      visible: true,
      icon: 'castle',
      iconColor: '#5c1d24',
      borderColor: '#f4efe6',
      battlemapId: null,
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

  setMarkerVisibility(id: string, visible: boolean): void {
    this.patchMarker(id, { visible });
  }

  setMarkerIcon(id: string, icon: WorldmapMarkerIcon): void {
    this.patchMarker(id, { icon });
  }

  setMarkerColors(id: string, iconColor: string, borderColor: string): void {
    if (!isHexColor(iconColor) || !isHexColor(borderColor)) {
      throw new Error('Invalid world map marker colors');
    }
    this.patchMarker(id, { iconColor, borderColor });
  }

  setMarkerBattlemap(id: string, battlemapId: string | null): void {
    this.patchMarker(id, { battlemapId });
  }

  showLinkedBattlemap(battlemapId: string): void {
    this.linkedBattlemapId.set(battlemapId);
    this.channel?.postMessage({ type: 'linked-battlemap', battlemapId } satisfies WorldmapMessage);
  }

  clearLinkedBattlemap(): void {
    this.linkedBattlemapId.set(null);
    this.channel?.postMessage({
      type: 'linked-battlemap',
      battlemapId: null,
    } satisfies WorldmapMessage);
  }

  removeMarker(id: string): void {
    this.updateCurrent((entry) => ({
      ...entry,
      markers: entry.markers.filter((marker) => marker.id !== id),
    }));
  }

  publishView(view: WorldmapView): void {
    const mapId = this.currentId();
    if (
      !mapId ||
      !Number.isFinite(view.centerX) ||
      !Number.isFinite(view.centerY) ||
      !Number.isFinite(view.zoom)
    ) {
      return;
    }
    this.hostViewMapId = mapId;
    this.hostView = view;
    this.views.set(mapId, view);
    this.channel?.postMessage({ type: 'view', mapId, view } satisfies WorldmapMessage);
  }

  viewFor(mapId: string | null): WorldmapView | null {
    return mapId ? (this.views.get(mapId) ?? null) : null;
  }

  exportState(): WorldmapState {
    return this.state();
  }

  /** Replaces all world maps with the given saved state. Throws if it isn't valid. */
  importState(saved: unknown): void {
    this.state.set(validate(saved));
    this.broadcastCurrent();
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
    this.broadcastMarkers();
    void this.persist();
  }

  private persist(): Promise<void> {
    const serialised = JSON.stringify(this.state());
    return this.saves.enqueue(
      () => store.write(serialised),
      () => this.persistenceError.set(null),
      (error) => {
        console.error('Could not save world maps', error);
        this.persistenceError.set(
          'The world maps could not be saved. They may be lost when you leave this page.',
        );
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

  private open(onMessage: (message: WorldmapMessage) => void): void {
    this.channel?.close();
    this.channel = new BroadcastChannel('dnd-worldmap');
    this.channel.onmessage = (event: MessageEvent<WorldmapMessage>) => onMessage(event.data);
  }

  private broadcastCurrent(): void {
    const current = this.current();
    this.channel?.postMessage({
      type: 'current',
      map: current ? { id: current.id, name: current.name, image: current.image } : null,
      view: current?.id === this.hostViewMapId ? this.hostView : DEFAULT_VIEW,
      linkedBattlemapId: this.linkedBattlemapId(),
    } satisfies WorldmapMessage);
    this.broadcastMarkers();
  }

  private broadcastMarkers(): void {
    const current = this.current();
    this.channel?.postMessage({
      type: 'markers',
      mapId: current?.id ?? null,
      markers: current?.markers.filter((marker) => marker.visible) ?? [],
    } satisfies WorldmapMessage);
  }
}

type WorldmapMessage =
  | { type: 'request' }
  | {
      type: 'current';
      map: Pick<WorldmapEntry, 'id' | 'name' | 'image'> | null;
      view: WorldmapView;
      linkedBattlemapId: string | null;
    }
  | { type: 'markers'; mapId: string | null; markers: WorldmapMarker[] }
  | { type: 'view'; mapId: string; view: WorldmapView }
  | { type: 'linked-battlemap'; battlemapId: string | null };

function validateMarkers(markers: unknown): WorldmapMarker[] {
  if (
    !Array.isArray(markers) ||
    !markers.every(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        typeof m.name === 'string' &&
        Number.isFinite(m.x) &&
        Number.isFinite(m.y) &&
        (m.visible === undefined || typeof m.visible === 'boolean') &&
        (m.icon === undefined || isWorldmapMarkerIcon(m.icon)) &&
        (m.iconColor === undefined || isHexColor(m.iconColor)) &&
        (m.borderColor === undefined || isHexColor(m.borderColor)),
    )
  ) {
    throw new Error('Invalid world map markers');
  }
  return markers.map((marker) => ({
    id: marker.id,
    name: marker.name,
    x: marker.x,
    y: marker.y,
    visible: marker.visible ?? true,
    icon: marker.icon ?? 'castle',
    iconColor: marker.iconColor ?? '#5c1d24',
    borderColor: marker.borderColor ?? '#f4efe6',
    battlemapId: typeof marker.battlemapId === 'string' ? marker.battlemapId : null,
  }));
}

function isHexColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function isWorldmapMarkerIcon(icon: unknown): icon is WorldmapMarkerIcon {
  return WORLDMAP_MARKER_ICONS.some((choice) => choice.id === icon);
}

function validateEntry(saved: unknown, fallbackId: string): WorldmapEntry {
  const data = saved as Partial<WorldmapEntry> | null;
  const image = data?.image;
  if (
    !data ||
    !image ||
    typeof image.url !== 'string' ||
    !(image.width > 0) ||
    !(image.height > 0)
  ) {
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
    currentId: maps.some((entry) => entry.id === data.currentId)
      ? (data.currentId as string)
      : (maps[0]?.id ?? null),
  };
}
