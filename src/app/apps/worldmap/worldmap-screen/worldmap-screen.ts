import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { DropdownPicker } from '../../../shared/ui/dropdown-picker/dropdown-picker';
import type { PickerItem } from '../../../shared/ui/dropdown-picker/dropdown-picker';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { MapUploadDialog } from '../../../shared/ui/map-upload-dialog/map-upload-dialog';
import { clamp } from '../../../shared/util/math';
import { escapeHtml, titleFromFileName } from '../../../shared/util/text';
import { WorldmapService } from '../worldmap.service';
import type { WorldmapImage, WorldmapMarker } from '../worldmap.service';

const ZOOM_LIMIT = 20;

@Component({
  selector: 'app-worldmap-screen',
  imports: [DropdownPicker, FileButton, MapUploadDialog],
  templateUrl: './worldmap-screen.html',
  styleUrl: './worldmap-screen.css',
})
export class WorldmapScreen {
  private readonly worldmap = inject(WorldmapService);
  private readonly confirm = inject(ConfirmService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('map');

  protected readonly maps = this.worldmap.maps;
  protected readonly mapItems = computed<PickerItem[]>(() =>
    this.maps().map((entry) => ({ id: entry.id, label: entry.name })),
  );
  protected readonly current = this.worldmap.current;
  protected readonly persistenceError = this.worldmap.persistenceError;
  protected readonly placing = signal(false);
  protected readonly error = signal('');
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly mapTitle = signal('');

  private map?: L.Map;
  private overlay?: L.ImageOverlay;
  private shownImage: WorldmapImage | null = null;
  private readonly pins = new Map<string, L.Marker>();
  /** A freshly placed marker's popup opens once the marker has been drawn. */
  private openAfterSync: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.map?.remove();
      this.map = undefined;
    });
    effect(() => {
      const current = this.current();
      const element = this.container().nativeElement;
      untracked(() => {
        this.map ??= this.createMap(element);
        this.syncImage(current?.image ?? null);
        this.syncMarkers(current?.image ?? null, current?.markers ?? []);
      });
    });
  }

  protected onFileSelected(file: File): void {
    this.error.set('');
    this.pendingFile.set(file);
    this.mapTitle.set(titleFromFileName(file.name, 'World map'));
  }

  protected cancelUpload(): void {
    this.pendingFile.set(null);
  }

  protected async confirmUpload(): Promise<void> {
    const file = this.pendingFile();
    const name = this.mapTitle().trim();
    if (!file || !name) {
      return;
    }
    try {
      this.error.set('');
      this.placing.set(false);
      await this.worldmap.addMap(file, name);
    } catch {
      this.error.set('That file could not be loaded as an image.');
    } finally {
      this.pendingFile.set(null);
    }
  }

  protected selectMap(id: string): void {
    this.placing.set(false);
    this.worldmap.selectMap(id);
  }

  protected async removeMap(id: string, name: string): Promise<void> {
    if (await this.confirm.ask('Remove the map "' + name + '" and its markers?')) {
      this.placing.set(false);
      this.worldmap.removeMap(id);
    }
  }

  protected togglePlacing(): void {
    this.placing.update((placing) => !placing);
  }

  protected resetView(): void {
    this.fit();
  }

  private createMap(element: HTMLDivElement): L.Map {
    const map = L.map(element, {
      crs: L.CRS.Simple,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      doubleClickZoom: false,
    });
    map.on('click', (event: L.LeafletMouseEvent) => {
      const image = this.shownImage;
      if (!this.placing() || !image) {
        return;
      }
      const { x, y } = toImagePoint(event.latlng, image);
      if (x < 0 || y < 0 || x > image.width || y > image.height) {
        return;
      }
      const marker = this.worldmap.addMarker(x, y);
      this.placing.set(false);
      this.openAfterSync = marker?.id ?? null;
    });
    return map;
  }

  private syncImage(image: WorldmapImage | null): void {
    const map = this.map;
    if (!map || image === this.shownImage) {
      return;
    }
    this.shownImage = image;
    this.overlay?.remove();
    this.overlay = undefined;
    if (!image) {
      return;
    }
    const bounds = imageBounds(image);
    this.overlay = L.imageOverlay(image.url, bounds).addTo(map);
    // Lift the previous image's limits so they can't constrain fitting the new one.
    map.setMaxBounds(L.latLngBounds([-1e7, -1e7], [1e7, 1e7]));
    this.fit();
    map.setMaxBounds(bounds.pad(0.25));
  }

  private fit(): void {
    const map = this.map;
    const image = this.shownImage;
    if (!map || !image) {
      return;
    }
    const bounds = imageBounds(image);
    map.invalidateSize();
    // Leaflet clamps the fitting zoom to the current limits (default min 0), which is too high for large images.
    map.setMinZoom(-ZOOM_LIMIT);
    map.setMaxZoom(ZOOM_LIMIT);
    const fitZoom = map.getBoundsZoom(bounds);
    map.setMinZoom(fitZoom - 1);
    map.setMaxZoom(fitZoom + 4);
    map.fitBounds(bounds, { animate: false });
  }

  private syncMarkers(image: WorldmapImage | null, markers: WorldmapMarker[]): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const wanted = new Set(image ? markers.map((marker) => marker.id) : []);
    for (const [id, pin] of this.pins) {
      if (!wanted.has(id)) {
        pin.remove();
        this.pins.delete(id);
      }
    }
    if (!image) {
      return;
    }
    for (const marker of markers) {
      const position = toLatLng(marker.x, marker.y, image);
      const existing = this.pins.get(marker.id);
      if (existing) {
        existing.setLatLng(position);
        existing.setTooltipContent(escapeHtml(marker.name));
        continue;
      }
      const pin = L.marker(position, { draggable: true, icon: pinIcon(), title: marker.name })
        .bindTooltip(escapeHtml(marker.name), { permanent: true, direction: 'right', offset: [10, -14] })
        .bindPopup(() => this.popupFor(marker.id), { minWidth: 180 })
        .addTo(map);
      pin.on('dragend', () => {
        const shown = this.shownImage;
        if (shown) {
          const { x, y } = toImagePoint(pin.getLatLng(), shown);
          this.worldmap.moveMarker(marker.id, clamp(x, 0, shown.width), clamp(y, 0, shown.height));
        }
      });
      this.pins.set(marker.id, pin);
      if (this.openAfterSync === marker.id) {
        this.openAfterSync = null;
        pin.openPopup();
      }
    }
  }

  private popupFor(id: string): HTMLElement {
    const marker = this.worldmap.current()?.markers.find((m) => m.id === id);
    const form = document.createElement('div');
    form.className = 'marker-popup';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.value = marker?.name ?? '';
    input.setAttribute('aria-label', 'Marker name');
    input.addEventListener('change', () => this.worldmap.renameMarker(id, input.value));
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        this.worldmap.renameMarker(id, input.value);
        this.pins.get(id)?.closePopup();
      }
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => this.worldmap.removeMarker(id));
    form.append(input, remove);
    return form;
  }
}

/** Leaflet's simple CRS has y pointing up, so image rows are flipped. */
function toLatLng(x: number, y: number, image: WorldmapImage): L.LatLngExpression {
  return [image.height - y, x];
}

function toImagePoint(latlng: L.LatLng, image: WorldmapImage): { x: number; y: number } {
  return { x: latlng.lng, y: image.height - latlng.lat };
}

function imageBounds(image: WorldmapImage): L.LatLngBounds {
  return L.latLngBounds([0, 0], [image.height, image.width]);
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'world-pin',
    html: '<span class="material-symbols-outlined" aria-hidden="true">location_on</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -24],
  });
}

