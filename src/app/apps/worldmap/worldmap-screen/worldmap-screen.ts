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
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { BattlemapService } from '../../battlemap/services/battlemap.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { MapUploadDialog } from '../../../shared/ui/map-upload-dialog/map-upload-dialog';
import { WaterRenderer } from '../../../shared/ui/water/water-renderer';
import { clamp } from '../../../shared/util/math';
import { escapeHtml, titleFromFileName } from '../../../shared/util/text';
import { PanelTabsService } from '../../../suite/shell/panel-tabs.service';
import type { PanelTab } from '../../../suite/shell/panel-tabs.service';
import { WorldmapService } from '../worldmap.service';
import type { WorldmapImage, WorldmapMarker } from '../worldmap.service';
import {
  MARKER_FONTS,
  MARKER_ICONS,
  MARKER_SIZES,
  MarkerOption,
  MarkerStyle,
  markerFont,
  markerFontSize,
} from '../marker-style';

const ZOOM_LIMIT = 20;

@Component({
  selector: 'app-worldmap-screen',
  imports: [FileButton, MapUploadDialog],
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
  protected readonly mapTabs = computed<PanelTab[]>(() =>
    this.maps().map((entry) => ({ id: entry.id, label: entry.name })),
  );
  protected readonly current = this.worldmap.current;
  protected readonly battlemaps = this.battlemap.maps;
  protected readonly battlemapLocked = this.battlemap.locked;
  protected readonly persistenceError = this.worldmap.persistenceError;
  protected readonly shared = this.worldmap.shared;
  protected readonly waterAnimated = this.worldmap.waterAnimated;
  /** Marker whose popup is open; highlighted in the Markers list. */
  protected readonly openMarkerId = signal<string | null>(null);
  protected readonly markersOpen = signal(false);
  protected readonly sortedMarkers = computed(() =>
    [...(this.current()?.markers ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  );
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
    inject(PanelTabsService).register({
      appId: 'worldmap',
      ariaLabel: 'World maps',
      tabs: this.mapTabs,
      currentId: computed(() => this.current()?.id ?? null),
      removeLabel: 'Delete map ',
      playerUrl: '/worldmap/player',
      select: (id) => this.selectMap(id),
      remove: (tab) => void this.removeMap(tab.id, tab.label),
    });
    this.worldmap.startHost();
    this.worldmap.clearLinkedBattlemap();
    this.battlemap.clearLinkedPlayerMap();
    inject(DestroyRef).onDestroy(() => {
      this.map?.remove();
      this.map = undefined;
      this.water?.destroy();
    });
    effect(() => {
      const animated = this.waterAnimated();
      untracked(() => this.water?.setAnimated(animated));
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

  protected toggleShared(): void {
    this.worldmap.setShared(!this.shared());
  }

  protected toggleWater(): void {
    this.worldmap.setWaterAnimated(!this.waterAnimated());
  }

  protected setMarkerVisible(id: string, visible: boolean): void {
    this.worldmap.setMarkerVisibility(id, visible);
  }

  /** Centres the map on a marker and opens its popup. */
  protected focusMarker(id: string): void {
    const pin = this.pins.get(id);
    if (!pin || !this.map) {
      return;
    }
    this.map.panTo(pin.getLatLng());
    pin.openPopup();
  }

  private createMap(element: HTMLDivElement): L.Map {
    const map = L.map(element, {
      crs: L.CRS.Simple,
      // The design has no zoom buttons: the mouse wheel and pinch zoom.
      zoomControl: false,
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
    this.water.setAnimated(this.waterAnimated());
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
        existing.setIcon(styledPin(marker));
        existing.setTooltipContent(labelHtml(marker));
        existing.setOpacity(marker.visible ? 1 : 0.45);
        existing.options.title = marker.name;
        continue;
      }
      const pin = L.marker(position, {
        draggable: true,
        icon: styledPin(marker),
        title: marker.name,
        opacity: marker.visible ? 1 : 0.45,
      })
        .bindTooltip(labelHtml(marker), {
          permanent: true,
          direction: 'bottom',
          offset: [0, 4],
          className: 'marker-label',
        })
        .bindPopup(() => this.popupFor(marker.id), {
          className: 'marker-popup-frame',
          closeButton: false,
          minWidth: 233,
          maxWidth: 233,
          offset: [0, -4],
        })
        .addTo(map);
      pin.on('popupopen', () => this.openMarkerId.set(marker.id));
      pin.on('popupclose', () => {
        if (this.openMarkerId() === marker.id) this.openMarkerId.set(null);
      });
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

  /** Popup from the design: editable name, eye/delete/close in the header, then the marker's style. */
  private popupFor(id: string): HTMLElement {
    const marker = this.worldmap.current()?.markers.find((m) => m.id === id);
    const root = el('div', 'marker-popup');
    if (!marker) {
      return root;
    }

    const header = el('div', 'mp-header');
    const title = el('input', 'mp-title');
    title.type = 'text';
    title.maxLength = 60;
    title.value = marker.name;
    title.setAttribute('aria-label', 'Marker name');
    title.addEventListener('change', () => this.worldmap.renameMarker(id, title.value));
    title.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        this.worldmap.renameMarker(id, title.value);
        title.blur();
      }
    });
    let visible = marker.visible;
    const eye = iconButton(visible ? 'visibility' : 'visibility_off', '');
    const syncEye = (): void => {
      eye.firstElementChild!.textContent = visible ? 'visibility' : 'visibility_off';
      const label = visible ? 'Visible to players – click to hide' : 'Hidden from players – click to show';
      eye.title = label;
      eye.setAttribute('aria-label', label);
      eye.setAttribute('aria-pressed', String(visible));
    };
    syncEye();
    eye.addEventListener('click', () => {
      visible = !visible;
      this.worldmap.setMarkerVisibility(id, visible);
      syncEye();
    });
    const remove = iconButton('delete', 'Delete marker');
    remove.addEventListener('click', () => this.worldmap.removeMarker(id));
    const close = iconButton('close', 'Close');
    close.addEventListener('click', () => this.pins.get(id)?.closePopup());
    header.append(title, eye, remove, close);

    const body = el('div', 'mp-body');
    const row = (label: string, control: HTMLElement): void => {
      const name = el('label', 'mp-label');
      name.textContent = label;
      const controlId = 'mp-' + id + '-' + label.toLowerCase();
      name.htmlFor = controlId;
      const input = control.matches('input, select') ? control : control.querySelector('input, select');
      input?.setAttribute('id', controlId);
      body.append(name, control);
    };
    const styleSelect = (key: 'icon' | 'font' | 'size', options: readonly MarkerOption[]): HTMLSelectElement =>
      selectOf(options, marker[key], (value) => this.worldmap.setMarkerStyle(id, { [key]: value }));
    row('Icon', styleSelect('icon', MARKER_ICONS));
    const font = styleSelect('font', MARKER_FONTS);
    font.style.fontFamily = markerFont(marker).css;
    font.style.fontWeight = String(markerFont(marker).weight);
    font.addEventListener('change', () => {
      const chosen = MARKER_FONTS.find((f) => f.id === font.value);
      font.style.fontFamily = chosen?.css ?? '';
      font.style.fontWeight = String(chosen?.weight ?? 400);
    });
    row('Font', font);
    row('Size', styleSelect('size', MARKER_SIZES));
    row('Color', colorField(marker.color, (value) => this.worldmap.setMarkerStyle(id, { color: value })));
    row('Border', colorField(marker.border, (value) => this.worldmap.setMarkerStyle(id, { border: value })));

    const battlemapRow = el('div', 'mp-battlemap');
    const battlemapOptions: MarkerOption[] = [{ id: '', label: '-no map selected-' }];
    if (marker.battlemapId && !this.battlemaps().some((entry) => entry.id === marker.battlemapId)) {
      battlemapOptions.push({ id: marker.battlemapId, label: 'Unavailable map' });
    }
    battlemapOptions.push(...this.battlemaps().map((entry) => ({ id: entry.id, label: entry.name })));
    const openBattlemap = iconButton('open_in_new', 'Open linked battlemap');
    const canOpen = (battlemapId: string): boolean =>
      this.battlemaps().some((entry) => entry.id === battlemapId) &&
      (!this.battlemapLocked() || this.battlemap.currentId() === battlemapId);
    const battlemapPicker = selectOf(battlemapOptions, marker.battlemapId ?? '', (value) => {
      this.worldmap.setMarkerBattlemap(id, value || null);
      openBattlemap.disabled = !canOpen(value);
    });
    openBattlemap.disabled = !canOpen(battlemapPicker.value);
    openBattlemap.addEventListener('click', () => {
      const battlemapId = battlemapPicker.value;
      if (canOpen(battlemapId)) {
        this.worldmap.showLinkedBattlemap(battlemapId);
        void this.router.navigate(['/battlemap/dm'], { queryParams: { linkedMapId: battlemapId } });
      }
    });
    battlemapRow.append(battlemapPicker, openBattlemap);
    row('Battlemap', battlemapRow);

    root.append(header, body);
    // Keeps clicks and scrolling inside the popup from reaching the map.
    L.DomEvent.disableClickPropagation(root);
    L.DomEvent.disableScrollPropagation(root);
    return root;
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

/** Round pin in the marker's colours; created lazily because Leaflet touches the DOM. */
function styledPin(marker: MarkerStyle): L.DivIcon {
  return L.divIcon({
    className: 'world-pin',
    html: `<span style="background:${marker.color};border-color:${marker.border}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

/** The marker's name under its pin, in the chosen font, size and colours. */
function labelHtml(marker: WorldmapMarker): string {
  const font = markerFont(marker);
  return (
    `<span class="marker-label-text" style="font-family:${font.css};font-weight:${font.weight};` +
    `font-size:${markerFontSize(marker)}px;color:${marker.color};--label-border:${marker.border}">` +
    `${escapeHtml(marker.name)}</span>`
  );
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

function iconButton(icon: string, label: string): HTMLButtonElement {
  const button = el('button', 'mp-icon-btn');
  button.type = 'button';
  if (label) {
    button.title = label;
    button.setAttribute('aria-label', label);
  }
  const glyph = el('span', 'icon');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  button.append(glyph);
  return button;
}

function selectOf(
  options: readonly MarkerOption[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = el('select', 'mp-field mp-select');
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    select.append(item);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

/** Colour swatch (opens the system picker) plus the hex code as text. */
function colorField(value: string, onChange: (value: string) => void): HTMLElement {
  const field = el('div', 'mp-field mp-color');
  const swatch = el('input', 'mp-swatch');
  swatch.type = 'color';
  swatch.value = value;
  swatch.setAttribute('aria-label', 'Pick colour');
  const hex = el('input', 'mp-hex');
  hex.type = 'text';
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.value = value.slice(1).toUpperCase();
  swatch.addEventListener('input', () => {
    hex.value = swatch.value.slice(1).toUpperCase();
    onChange(swatch.value);
  });
  hex.addEventListener('keydown', (event) => event.stopPropagation());
  hex.addEventListener('change', () => {
    const typed = '#' + hex.value.replace(/^#/, '').trim();
    if (/^#[0-9a-f]{6}$/i.test(typed)) {
      swatch.value = typed.toLowerCase();
      onChange(swatch.value);
    }
    hex.value = swatch.value.slice(1).toUpperCase();
  });
  field.append(swatch, hex);
  return field;
}
