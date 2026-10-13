import { Service, computed, inject, signal } from '@angular/core';
import { InitiativeService } from './initiative.service';

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

export type MapIcon = 'castle' | 'forest' | 'city';

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
  readonly currentId = signal<string | null>(null);
  /** The map players see, if any. Players only see a map once the DM shares it, so it can be prepared in private first. */
  readonly sharedId = signal<string | null>(null);
  readonly shared = computed(() => this.sharedId() !== null && this.sharedId() === this.currentId());
  /** Maps can't be switched while a fight is running. */
  readonly locked = computed(() => this.initiative.activeId() !== null);

  private readonly initiative = inject(InitiativeService);
  private channel?: BroadcastChannel;
  private persistTimer?: ReturnType<typeof setTimeout>;

  startHost(): void {
    this.restore();
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
    this.persist();
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
  }

  /** Copies the working copy back into the current map's entry. */
  private syncCurrent(): void {
    const id = this.currentId();
    const map = this.map();
    if (id && map) {
      this.maps.update((maps) => maps.map((m) => (m.id === id ? { ...m, map, rooms: this.rooms(), view: this.view() } : m)));
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

  private persist(): void {
    clearTimeout(this.persistTimer);
    this.syncCurrent();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ maps: this.maps(), currentId: this.currentId(), sharedId: this.sharedId() }),
      );
    } catch {
      // Large images can exceed the storage quota; live sync still works.
    }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw) as {
        maps?: MapEntry[];
        currentId?: string | null;
        sharedId?: string | null;
        // Single-map format from before maps could be switched.
        map?: MapImage | null;
        rooms?: Room[];
        view?: View;
        shared?: boolean;
      };
      let maps = (saved.maps ?? []).map((entry) => ({ ...entry, icon: entry.icon ?? 'castle' as MapIcon }));
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
          },
        ];
        sharedId = saved.shared ? id : null;
      }
      const current = maps.find((m) => m.id === saved.currentId) ?? maps[0] ?? null;
      this.maps.set(maps);
      this.sharedId.set(maps.some((m) => m.id === sharedId) ? sharedId : null);
      this.load(current && { ...current, view: clampView(current.map, current.view, this.playerAspect()) });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
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
