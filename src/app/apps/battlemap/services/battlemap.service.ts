import { Service, computed, inject, signal } from '@angular/core';
import { InitiativeService } from './initiative.service';
import type { InitiativeState } from './initiative.service';

export interface Point {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  points: Point[];
  revealed: boolean;
}

export interface MapImage {
  url: string;
  width: number;
  height: number;
}

export type MapIcon = 'castle' | 'forest' | 'city' | 'cave';

/** Zoom factor (1 = whole map) and the map coordinate shown at the centre of the screen. */
export interface View {
  zoom: number;
  cx: number;
  cy: number;
}

export interface MapEntry {
  id: string;
  name: string;
  icon: MapIcon;
  map: MapImage;
  rooms: Room[];
  view: View;
  initiative?: InitiativeState;
  initiativeShared?: boolean;
}

export interface PlayerPreset {
  id: string;
  name: string;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of the map a screen with the given width/height ratio shows. Zoom 1 fits the whole map. */
export function viewRect(map: MapImage, view: View, ratio: number): Rect {
  const w = Math.max(map.width, map.height * ratio) / view.zoom;
  const h = w / ratio;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

export function clampView(map: MapImage, view: View, ratio: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const { w, h } = viewRect(map, { ...view, zoom }, ratio);
  return {
    zoom,
    cx: w >= map.width ? map.width / 2 : Math.min(map.width - w / 2, Math.max(w / 2, view.cx)),
    cy: h >= map.height ? map.height / 2 : Math.min(map.height - h / 2, Math.max(h / 2, view.cy)),
  };
}

export function viewBoxFor(rect: Rect): string {
  return `${rect.x} ${rect.y} ${rect.w} ${rect.h}`;
}

type Message =
  | { type: 'request' }
  | { type: 'map'; map: MapImage | null }
  | { type: 'rooms'; rooms: Room[] }
  | { type: 'view'; view: View }
  | { type: 'aspect'; ratio: number }
  | { type: 'pan'; dx: number; dy: number };

const CHANNEL_NAME = 'dnd-battlemap';
const STORAGE_KEY = 'dnd-battlemap';
const DATABASE_NAME = 'dnd-battlemap';
const DATABASE_VERSION = 1;
const DATABASE_STORE = 'state';
const DATABASE_RECORD = 'current';
const PERSIST_DELAY_MS = 400;

/**
 * Holds the battlemap state. The DM screen is the "host" and owns the state;
 * the player screen is a "viewer" that mirrors it over a BroadcastChannel.
 */
@Service()
export class BattlemapService {
  /** The map the DM is currently working on. `map`, `rooms` and `view` are its live working copy. */
  readonly map = signal<MapImage | null>(null);
  readonly rooms = signal<Room[]>([]);
  /** What the players see. The DM screen always shows the whole map and outlines this area. */
  readonly view = signal<View>({ zoom: 1, cx: 0, cy: 0 });
  /** Width/height ratio of the player screen, reported by that screen. */
  readonly playerAspect = signal(16 / 9);

  /** All maps, each keeping its own shapes and view. The current map's entry is refreshed from the working copy on save. */
  readonly maps = signal<MapEntry[]>([]);
  /** Player characters kept ready to add to any map's initiative order. */
  readonly players = signal<PlayerPreset[]>([]);
  readonly currentId = signal<string | null>(null);
  /** The map players see, if any. Players only see a map once the DM shares it, so it can be prepared in private first. */
  readonly sharedId = signal<string | null>(null);
  readonly shared = computed(() => this.sharedId() !== null && this.sharedId() === this.currentId());
  readonly persistenceError = signal<string | null>(null);
  /** Maps can't be switched while a fight is running. */
  readonly locked = computed(() => this.initiative.activeId() !== null);

  private readonly initiative = inject(InitiativeService);
  private channel?: BroadcastChannel;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private persistQueue: Promise<void> = Promise.resolve();
  private restored = false;
  private restorePromise?: Promise<void>;
  /** Increments whenever a saved state replaces the current one, so open screens can reset their local state. */
  readonly importCount = signal(0);

  startHost(): void {
    this.initiative.setChangeHandler(() => this.persist());
    void this.ensureRestored().then(() => {
      this.open((message) => {
        if (message.type === 'request') {
          this.broadcastMap();
          this.broadcastRooms();
          this.broadcastView();
        } else if (message.type === 'aspect' && message.ratio > 0) {
          this.playerAspect.set(message.ratio);
          this.setView(this.view());
        } else if (message.type === 'pan') {
          this.panView(message.dx, message.dy);
        }
      });
    });
  }

  reportAspect(ratio: number): void {
    this.post({ type: 'aspect', ratio });
  }

  requestPan(dx: number, dy: number): void {
    this.post({ type: 'pan', dx, dy });
  }

  startViewer(): void {
    this.open((message) => {
      if (message.type === 'map') {
        this.map.set(message.map);
      } else if (message.type === 'rooms') {
        this.rooms.set(message.rooms);
      } else if (message.type === 'view') {
        this.view.set(message.view);
      }
    });
    this.post({ type: 'request' });
  }

  async addMap(file: File, name: string, icon: MapIcon): Promise<void> {
    await this.ensureRestored();
    const url = await readAsDataUrl(file);
    const { width, height } = await measure(url);
    this.syncCurrent();
    const entry: MapEntry = {
      id: crypto.randomUUID(),
      name,
      icon,
      map: { url, width, height },
      rooms: [],
      view: { zoom: 1, cx: width / 2, cy: height / 2 },
    };
    this.maps.update((maps) => [...maps, entry]);
    this.load(entry);
    await this.persist();
  }

  /** Switches the map the DM is working on. Players keep seeing the shared map. */
  selectMap(id: string): void {
    const entry = this.maps().find((m) => m.id === id);
    if (!entry || id === this.currentId() || this.locked()) {
      return;
    }
    this.syncCurrent();
    this.load(this.maps().find((m) => m.id === id) ?? entry);
    this.persist();
  }

  removeMap(id: string): void {
    if (this.locked()) {
      return;
    }
    this.syncCurrent();
    this.maps.update((maps) => maps.filter((m) => m.id !== id));
    if (this.sharedId() === id) {
      this.sharedId.set(null);
      this.broadcastAll();
    }
    if (this.currentId() === id) {
      this.load(this.maps()[0] ?? null);
    }
    this.persist();
  }

  addPlayer(name: string): void {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('A player name is required');
    }
    this.players.update((players) => [...players, { id: crypto.randomUUID(), name: trimmedName }]);
    this.persist();
  }

  removePlayer(id: string): void {
    this.players.update((players) => players.filter((player) => player.id !== id));
    this.persist();
  }

  /** Whether the players can be pointed at the current map right now. */
  canShare(): boolean {
    const sharedId = this.sharedId();
    return this.map() !== null && (sharedId === null || sharedId === this.currentId() || !this.locked());
  }

  /** Shares the current map with the players (replacing whatever they saw), or hides it again. */
  setShared(shared: boolean): void {
    if (shared ? !this.canShare() : this.sharedId() !== this.currentId()) {
      return;
    }
    this.sharedId.set(shared ? this.currentId() : null);
    this.broadcastAll();
    this.initiative.publish();
    this.persist();
  }

  setInitiativeShared(shared: boolean): void {
    if (!this.currentId()) {
      return;
    }
    this.initiative.setShared(shared);
    this.persist();
  }

  setView(view: View): void {
    const map = this.map();
    if (!map) {
      return;
    }
    this.view.set(clampView(map, view, this.playerAspect()));
    this.broadcastView();
    this.persistSoon();
  }

  private panView(dx: number, dy: number): void {
    const map = this.map();
    if (!map) {
      return;
    }
    const view = this.view();
    const rect = viewRect(map, view, this.playerAspect());
    this.setView({
      ...view,
      cx: view.cx + rect.w * dx,
      cy: view.cy + rect.h * dy,
    });
  }

  resetView(): void {
    const map = this.map();
    if (map) {
      this.setView({ zoom: 1, cx: map.width / 2, cy: map.height / 2 });
    }
  }

  addRoom(points: Point[]): void {
    const name = `Room ${this.rooms().length + 1}`;
    this.rooms.update((rooms) => [...rooms, { id: crypto.randomUUID(), name, points, revealed: false }]);
    this.commit();
  }

  renameRoom(id: string, name: string): void {
    this.patchRoom(id, { name });
  }

  toggleRoom(id: string): void {
    const room = this.rooms().find((r) => r.id === id);
    if (room) {
      this.patchRoom(id, { revealed: !room.revealed });
    }
  }

  setAllRevealed(revealed: boolean): void {
    this.rooms.update((rooms) => rooms.map((room) => ({ ...room, revealed })));
    this.commit();
  }

  removeRoom(id: string): void {
    this.rooms.update((rooms) => rooms.filter((room) => room.id !== id));
    this.commit();
  }

  private patchRoom(id: string, patch: Partial<Room>): void {
    this.rooms.update((rooms) => rooms.map((room) => (room.id === id ? { ...room, ...patch } : room)));
    this.commit();
  }

  private commit(): void {
    this.broadcastRooms();
    this.persist();
  }

  private load(entry: MapEntry | null): void {
    this.currentId.set(entry?.id ?? null);
    this.map.set(entry?.map ?? null);
    this.rooms.set(entry?.rooms ?? []);
    this.view.set(entry?.view ?? { zoom: 1, cx: 0, cy: 0 });
    this.initiative.loadState(
      entry?.initiative ?? { combatants: [], activeId: null },
      entry?.initiativeShared ?? false,
    );
  }

  /** Copies the working copy back into the current map's entry. */
  private syncCurrent(): void {
    const id = this.currentId();
    const map = this.map();
    if (id && map) {
      this.maps.update((maps) =>
        maps.map((m) =>
          m.id === id
            ? {
                ...m,
                map,
                rooms: this.rooms(),
                view: this.view(),
                initiative: this.initiative.exportState(),
                initiativeShared: this.initiative.shared(),
              }
            : m,
        ),
      );
    }
  }

  /** What the players should see: the working copy if the current map is shared, otherwise the stored entry. */
  private sharedContent(): { map: MapImage; rooms: Room[]; view: View } | null {
    const sharedId = this.sharedId();
    if (sharedId === null) {
      return null;
    }
    const map = this.map();
    if (sharedId === this.currentId() && map) {
      return { map, rooms: this.rooms(), view: this.view() };
    }
    return this.maps().find((m) => m.id === sharedId) ?? null;
  }

  private broadcastAll(): void {
    this.broadcastMap();
    this.broadcastRooms();
    this.broadcastView();
  }

  private open(onMessage: (message: Message) => void): void {
    this.channel?.close();
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent<Message>) => onMessage(event.data);
  }

  private post(message: Message): void {
    this.channel?.postMessage(message);
  }

  private broadcastMap(): void {
    this.post({ type: 'map', map: this.sharedContent()?.map ?? null });
  }

  private broadcastRooms(): void {
    this.post({ type: 'rooms', rooms: this.sharedContent()?.rooms ?? [] });
  }

  private broadcastView(): void {
    const content = this.sharedContent();
    if (content) {
      this.post({ type: 'view', view: content.view });
    }
  }

  /** Serialising the whole map is expensive, so view changes (e.g. dragging) are saved once they settle. */
  private persistSoon(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), PERSIST_DELAY_MS);
  }

  private persist(): Promise<void> {
    clearTimeout(this.persistTimer);
    this.syncCurrent();
    const state = JSON.stringify({
      maps: this.maps(),
      players: this.players(),
      currentId: this.currentId(),
      sharedId: this.sharedId(),
      initiative: this.initiative.exportState(),
      initiativeShared: this.initiative.shared(),
    });
    this.persistQueue = this.persistQueue
      .then(() => savePersistedState(state))
      .then(() => this.persistenceError.set(null))
      .catch((error: unknown) => {
        console.error('Could not save battlemap state', error);
        this.persistenceError.set('Battlemap data could not be saved. It may be lost when you leave this page.');
      });
    return this.persistQueue;
  }

  /** Loads persisted state once before the DM screen or project tools use it. */
  ensureRestored(): Promise<void> {
    if (this.restored) {
      return Promise.resolve();
    }
    if (!this.restorePromise) {
      this.restorePromise = this.restore();
    }
    return this.restorePromise;
  }

  private async restore(): Promise<void> {
    if (typeof window === 'undefined') {
      this.restored = true;
      return;
    }
    try {
      let raw: string | null = null;
      try {
        raw = await readIndexedState();
      } catch (error) {
        console.error('Could not read battlemap state from IndexedDB', error);
      }
      if (!raw) {
        raw = localStorage.getItem(STORAGE_KEY);
      }
      if (raw) {
        this.apply(JSON.parse(raw));
        if (typeof indexedDB !== 'undefined') {
          try {
            await writeIndexedState(raw);
            localStorage.removeItem(STORAGE_KEY);
          } catch (error) {
            console.error('Could not migrate battlemap state to IndexedDB', error);
          }
        }
      }
    } catch (error) {
      console.error('Could not restore battlemap state', error);
      this.persistenceError.set('Saved battlemap data could not be restored.');
    } finally {
      this.restored = true;
    }
  }

  /** The maps and saved player roster as exported to a file. */
  exportState(): {
    maps: MapEntry[];
    currentId: string | null;
    sharedId: string | null;
    players: PlayerPreset[];
    initiative: InitiativeState;
    initiativeShared: boolean;
  } {
    this.syncCurrent();
    return {
      maps: this.maps(),
      currentId: this.currentId(),
      sharedId: this.sharedId(),
      players: this.players(),
      initiative: this.initiative.exportState(),
      initiativeShared: this.initiative.shared(),
    };
  }

  /** Replaces all maps with the given saved state. Throws if it isn't valid. */
  importState(saved: unknown): void {
    const data = saved as { maps?: unknown; players?: unknown } | null;
    if (!data || !Array.isArray(data.maps)) {
      throw new Error('No maps in file');
    }
    const valid = data.maps.every(
      (m) =>
        m && typeof m.id === 'string' && typeof m.name === 'string' && Array.isArray(m.rooms) &&
        m.map && typeof m.map.url === 'string' && m.map.width > 0 && m.map.height > 0,
    );
    if (!valid) {
      throw new Error('Invalid map data');
    }
    this.apply(saved as SavedState);
    this.broadcastAll();
    this.initiative.publish();
    this.persist();
    this.importCount.update((n) => n + 1);
  }

  private apply(saved: SavedState): void {
    const initiative = saved.initiative ?? this.initiative.exportState();
    const initiativeShared = saved.initiativeShared ?? this.initiative.shared();
    const players = saved.players === undefined ? undefined : validatePlayers(saved.players);
    {
      let maps = (saved.maps ?? []).map((entry) => ({
        ...entry,
        icon: entry.icon ?? ('castle' as MapIcon),
        view: entry.view ?? { zoom: 1, cx: entry.map.width / 2, cy: entry.map.height / 2 },
        initiativeShared: entry.initiativeShared ?? false,
      }));
      let sharedId = saved.sharedId ?? null;
      if (!saved.maps && saved.map) {
        const id = crypto.randomUUID();
        maps = [
          {
            id,
            name: 'Map 1',
            icon: 'castle',
            map: saved.map,
            rooms: saved.rooms ?? [],
            view: saved.view ?? { zoom: 1, cx: saved.map.width / 2, cy: saved.map.height / 2 },
            initiativeShared: false,
          },
        ];
        sharedId = saved.shared ? id : null;
      }
      let current = maps.find((m) => m.id === saved.currentId) ?? maps[0] ?? null;
      if (current && current.initiative === undefined) {
        const currentId = current.id;
        current = { ...current, initiative, initiativeShared };
        maps = maps.map((entry) => (entry.id === currentId ? current! : entry));
      }
      this.maps.set(maps);
      if (players !== undefined) {
        this.players.set(players);
      }
      this.sharedId.set(maps.some((m) => m.id === sharedId) ? sharedId : null);
      if (current) {
        this.load({ ...current, view: clampView(current.map, current.view, this.playerAspect()) });
      } else {
        this.load(null);
        this.initiative.loadState(initiative, initiativeShared);
      }
    }
  }
}

async function savePersistedState(state: string): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      await writeIndexedState(state);
      return;
    } catch (indexedDbError) {
      try {
        localStorage.setItem(STORAGE_KEY, state);
        console.error('IndexedDB is unavailable; saved battlemap state in localStorage instead', indexedDbError);
        return;
      } catch (localStorageError) {
        throw new Error('Could not save battlemap state in IndexedDB or localStorage', { cause: localStorageError });
      }
    }
  }
  localStorage.setItem(STORAGE_KEY, state);
}

function readIndexedState(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return openStateDatabase().then(
    (database) =>
      new Promise<string | null>((resolve, reject) => {
        const transaction = database.transaction(DATABASE_STORE, 'readonly');
        const request = transaction.objectStore(DATABASE_STORE).get(DATABASE_RECORD);
        request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
        request.onerror = () => reject(request.error ?? new Error('Could not read battlemap state'));
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('Reading battlemap state was aborted'));
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('Could not read battlemap state'));
        };
      }),
  );
}

function writeIndexedState(state: string): Promise<void> {
  return openStateDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(DATABASE_STORE, 'readwrite');
        transaction.objectStore(DATABASE_STORE).put(state, DATABASE_RECORD);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('Could not save battlemap state'));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('Saving battlemap state was aborted'));
        };
      }),
  );
}

function openStateDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DATABASE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open battlemap state database'));
  });
}

interface SavedState {
  maps?: MapEntry[];
  players?: PlayerPreset[];
  currentId?: string | null;
  sharedId?: string | null;
  // Single-map format from before maps could be switched.
  map?: MapImage | null;
  rooms?: Room[];
  view?: View;
  shared?: boolean;
  initiative?: InitiativeState;
  initiativeShared?: boolean;
}

function validatePlayers(saved: unknown): PlayerPreset[] {
  if (!Array.isArray(saved)) {
    throw new Error('Invalid player data');
  }
  return saved.map((player: unknown) => {
    if (!player || typeof player !== 'object') {
      throw new Error('Invalid player data');
    }
    const data = player as { id?: unknown; name?: unknown };
    if (typeof data.id !== 'string' || !data.id.trim() || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Invalid player data');
    }
    return { id: data.id, name: data.name.trim() };
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function measure(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = url;
  });
}
