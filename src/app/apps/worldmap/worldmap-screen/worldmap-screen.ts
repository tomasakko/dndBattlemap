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
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { BattlemapService } from '../../battlemap/services/battlemap.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { DropdownPicker } from '../../../shared/ui/dropdown-picker/dropdown-picker';
import type { PickerItem } from '../../../shared/ui/dropdown-picker/dropdown-picker';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { MapUploadDialog } from '../../../shared/ui/map-upload-dialog/map-upload-dialog';
import { WaterRenderer } from '../../../shared/ui/water/water-renderer';
import { clamp } from '../../../shared/util/math';
import { escapeHtml, titleFromFileName } from '../../../shared/util/text';
import { WorldmapService } from '../worldmap.service';
import { WORLDMAP_MARKER_ICONS } from '../worldmap.service';
import type { WorldmapImage, WorldmapMarker, WorldmapMarkerIcon } from '../worldmap.service';

const ZOOM_LIMIT = 20;

@Component({
  selector: 'app-worldmap-screen',
  imports: [DropdownPicker, FileButton, MapUploadDialog, RouterLink],
  templateUrl: './worldmap-screen.html',
  styleUrl: './worldmap-screen.css',
})
export class WorldmapScreen {
  private readonly worldmap = inject(WorldmapService);
  private readonly battlemap = inject(BattlemapService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('map');

  protected readonly maps = this.worldmap.maps;
  protected readonly mapItems = computed<PickerItem[]>(() =>
    this.maps().map((entry) => ({ id: entry.id, label: entry.name })),
  );
  protected readonly current = this.worldmap.current;
  protected readonly battlemaps = this.battlemap.maps;
  protected readonly battlemapLocked = this.battlemap.locked;
  protected readonly markerIcons = WORLDMAP_MARKER_ICONS;
  protected readonly persistenceError = this.worldmap.persistenceError;
  protected readonly placing = signal(false);
  protected readonly error = signal('');
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly mapTitle = signal('');

  private map?: L.Map;
  private overlay?: L.ImageOverlay;
  private waterOverlay?: L.SVGOverlay;
  private water?: WaterRenderer;
  private shownImage: WorldmapImage | null = null;
  private restoringView = false;
  private readonly pins = new Map<string, L.Marker>();
  /** A freshly placed marker's popup opens once the marker has been drawn. */
  private openAfterSync: string | null = null;

  constructor() {
    this.worldmap.startHost();
    this.worldmap.clearLinkedBattlemap();
    this.battlemap.clearLinkedPlayerMap();
    inject(DestroyRef).onDestroy(() => {
      this.map?.remove();
      this.map = undefined;
      this.water?.destroy();
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
    map.on('moveend zoomend', () => this.publishView());
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

  /** Water goes in its own SVG overlay below the map image, so only transparent sea shows it. */
  private addWater(map: L.Map, image: WorldmapImage, bounds: L.LatLngBounds): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${image.width} ${image.height}`);
    // Leaflet's stylesheet forces z-index 200 on SVGs in a pane, which would cover the map image.
    svg.style.zIndex = '1';
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    host.setAttribute('width', String(image.width));
    host.setAttribute('height', String(image.height));
    const canvas = document.createElement('canvas');
    canvas.className = 'ui-water';
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.append(canvas);
    svg.append(host);
    this.waterOverlay = L.svgOverlay(svg, bounds, { interactive: false, zIndex: 1 }).addTo(map);
    this.water = new WaterRenderer(canvas);
    void this.water.load(image.url);
  }

  private syncImage(image: WorldmapImage | null): void {
    const map = this.map;
    if (!map || image === this.shownImage) {
      return;
    }
    this.shownImage = image;
    this.waterOverlay?.remove();
    this.waterOverlay = undefined;
    this.water?.destroy();
    this.water = undefined;
    this.overlay?.remove();
    this.overlay = undefined;
    if (!image) {
      return;
    }
    const bounds = imageBounds(image);
    this.addWater(map, image, bounds);
    this.overlay = L.imageOverlay(image.url, bounds, { zIndex: 2 }).addTo(map);
    const savedView = this.worldmap.viewFor(this.worldmap.currentId());
    this.restoringView = true;
    // Lift the previous image's limits so they can't constrain fitting the new one.
    map.setMaxBounds(L.latLngBounds([-1e7, -1e7], [1e7, 1e7]));
    this.fit();
    map.setMaxBounds(bounds.pad(0.25));
    if (savedView) {
      const fitZoom = map.getBoundsZoom(bounds);
      const zoom = Math.max(
        map.getMinZoom(),
        Math.min(map.getMaxZoom(), fitZoom + Math.log2(savedView.zoom)),
      );
      map.setView([image.height * (1 - savedView.centerY), image.width * savedView.centerX], zoom, {
        animate: false,
      });
    }
    this.restoringView = false;
    this.publishView();
  }

  private publishView(): void {
    const map = this.map;
    const image = this.shownImage;
    if (!map || !image || this.restoringView) {
      return;
    }
    const center = map.getCenter();
    const fitZoom = map.getBoundsZoom(imageBounds(image));
    this.worldmap.publishView({
      centerX: center.lng / image.width,
      centerY: 1 - center.lat / image.height,
      zoom: 2 ** (map.getZoom() - fitZoom),
    });
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
        existing.setIcon(pinIcon(marker.icon, marker.iconColor, marker.borderColor));
        existing.setOpacity(marker.visible ? 1 : 0.45);
        existing.options.title = marker.name;
        continue;
      }
      const pin = L.marker(position, {
        draggable: true,
        icon: pinIcon(marker.icon, marker.iconColor, marker.borderColor),
        title: marker.name,
        opacity: marker.visible ? 1 : 0.45,
      })
        .bindTooltip(escapeHtml(marker.name), {
          permanent: true,
          direction: 'top',
          offset: [0, -22],
        })
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
    const icon = document.createElement('select');
    icon.setAttribute('aria-label', 'Marker icon');
    for (const choice of WORLDMAP_MARKER_ICONS) {
      const option = document.createElement('option');
      option.value = choice.id;
      option.textContent = choice.label;
      option.selected = choice.id === marker?.icon;
      icon.append(option);
    }
    icon.addEventListener('change', () => {
      const selected = WORLDMAP_MARKER_ICONS.find((choice) => choice.id === icon.value);
      if (selected) {
        this.worldmap.setMarkerIcon(id, selected.id);
      }
    });
    const iconColor = document.createElement('input');
    iconColor.type = 'color';
    iconColor.value = marker?.iconColor ?? '#5c1d24';
    iconColor.setAttribute('aria-label', 'Icon color');
    const iconColorLabel = document.createElement('label');
    iconColorLabel.className = 'marker-color';
    iconColorLabel.append(document.createTextNode('Icon color'), iconColor);
    const borderColor = document.createElement('input');
    borderColor.type = 'color';
    borderColor.value = marker?.borderColor ?? '#f4efe6';
    borderColor.setAttribute('aria-label', 'Border color');
    const borderColorLabel = document.createElement('label');
    borderColorLabel.className = 'marker-color';
    borderColorLabel.append(document.createTextNode('Border color'), borderColor);
    const saveColors = () => this.worldmap.setMarkerColors(id, iconColor.value, borderColor.value);
    iconColor.addEventListener('input', saveColors);
    borderColor.addEventListener('input', saveColors);
    const battlemapPicker = document.createElement('select');
    battlemapPicker.setAttribute('aria-label', 'Linked battlemap');
    const noBattlemap = document.createElement('option');
    noBattlemap.value = '';
    noBattlemap.textContent = 'No linked battlemap';
    battlemapPicker.append(noBattlemap);
    const hasLinkedBattlemap = this.battlemaps().some((entry) => entry.id === marker?.battlemapId);
    if (marker?.battlemapId && !hasLinkedBattlemap) {
      const unavailable = document.createElement('option');
      unavailable.value = marker.battlemapId;
      unavailable.textContent = 'Linked battlemap unavailable';
      battlemapPicker.append(unavailable);
    }
    for (const entry of this.battlemaps()) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      option.selected = entry.id === marker?.battlemapId;
      battlemapPicker.append(option);
    }
    battlemapPicker.value = marker?.battlemapId ?? '';
    const openBattlemap = document.createElement('button');
    openBattlemap.type = 'button';
    openBattlemap.textContent = 'Open linked battlemap';
    openBattlemap.disabled =
      !this.battlemaps().some((entry) => entry.id === marker?.battlemapId) ||
      (this.battlemapLocked() && this.battlemap.currentId() !== marker?.battlemapId);
    battlemapPicker.addEventListener('change', () => {
      this.worldmap.setMarkerBattlemap(id, battlemapPicker.value || null);
      openBattlemap.disabled =
        !this.battlemaps().some((entry) => entry.id === battlemapPicker.value) ||
        (this.battlemapLocked() && this.battlemap.currentId() !== battlemapPicker.value);
    });
    openBattlemap.addEventListener('click', () => {
      const battlemapId = battlemapPicker.value;
      if (
        this.battlemaps().some((entry) => entry.id === battlemapId) &&
        (!this.battlemapLocked() || this.battlemap.currentId() === battlemapId)
      ) {
        this.worldmap.showLinkedBattlemap(battlemapId);
        void this.router.navigate(['/battlemap/dm'], { queryParams: { linkedMapId: battlemapId } });
      }
    });
    const visibilityLabel = document.createElement('label');
    visibilityLabel.className = 'marker-visibility';
    const visibility = document.createElement('input');
    visibility.type = 'checkbox';
    visibility.checked = marker?.visible ?? true;
    visibilityLabel.append(visibility, document.createTextNode(' Visible to players'));
    visibility.addEventListener('change', () =>
      this.worldmap.setMarkerVisibility(id, visibility.checked),
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => this.worldmap.removeMarker(id));
    form.append(
      input,
      icon,
      iconColorLabel,
      borderColorLabel,
      battlemapPicker,
      openBattlemap,
      visibilityLabel,
      remove,
    );
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

function pinIcon(icon: WorldmapMarkerIcon, iconColor: string, borderColor: string): L.DivIcon {
  const glyph = WORLDMAP_MARKER_ICONS.find((choice) => choice.id === icon)?.glyph ?? 'castle';
  return L.divIcon({
    className: 'world-pin',
    html: `<span class="material-symbols-outlined" aria-hidden="true" style="color:${iconColor};-webkit-text-stroke:1px ${borderColor}">${glyph}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -24],
  });
}
