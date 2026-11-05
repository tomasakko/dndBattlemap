import * as L from 'leaflet';
import { WaterRenderer } from '../../../shared/ui/water/water-renderer';
import { escapeHtml } from '../../../shared/util/text';
import { MarkerStyle, markerFont, markerFontSize } from '../domain/marker-style';
import type { WorldmapImage, WorldmapMarker, WorldmapView } from '../domain/model';

/** Leaflet's fitting maths needs room to go below and above the final limits. */
const ZOOM_LIMIT = 20;

export interface WorldmapLeafletEvents {
  /** The map was clicked on the image; `x`/`y` are image pixels. */
  clicked(x: number, y: number): void;
  markerMoved(id: string, x: number, y: number): void;
  viewChanged(view: WorldmapView): void;
  /** Builds the content of a marker's popup when it opens. */
  popupContent(id: string): HTMLElement;
  popupOpened(id: string): void;
  popupClosed(id: string): void;
}

/**
 * All Leaflet plumbing of the DM's world map: the image, the animated sea under it, the marker pins and
 * their labels, and translating between Leaflet coordinates and image pixels. The screen only deals with
 * markers and views.
 */
export class WorldmapLeaflet {
  private readonly map: L.Map;
  private overlay?: L.ImageOverlay;
  private waterOverlay?: L.SVGOverlay;
  private water?: WaterRenderer;
  private image: WorldmapImage | null = null;
  private restoringView = false;
  private waterAnimated = true;
  private readonly pins = new Map<string, L.Marker>();

  constructor(
    element: HTMLElement,
    private readonly events: WorldmapLeafletEvents,
  ) {
    this.map = L.map(element, {
      crs: L.CRS.Simple,
      // The design has no zoom buttons: the mouse wheel and pinch zoom.
      zoomControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      doubleClickZoom: false,
    });
    this.map.on('moveend zoomend', () => this.publishView());
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      const image = this.image;
      if (!image) {
        return;
      }
      const { x, y } = toImagePoint(event.latlng, image);
      if (x >= 0 && y >= 0 && x <= image.width && y <= image.height) {
        this.events.clicked(x, y);
      }
    });
  }

  /** Shows another image (or none), at the given view or fitted to the screen. */
  showImage(image: WorldmapImage | null, view: WorldmapView | null): void {
    if (image === this.image) {
      return;
    }
    this.image = image;
    this.removeImage();
    if (!image) {
      return;
    }
    const bounds = imageBounds(image);
    this.addWater(image, bounds);
    this.overlay = L.imageOverlay(image.url, bounds, { zIndex: 2 }).addTo(this.map);
    this.restoringView = true;
    // Lift the previous image's limits so they can't constrain fitting the new one.
    this.map.setMaxBounds(L.latLngBounds([-1e7, -1e7], [1e7, 1e7]));
    this.fit(bounds);
    this.map.setMaxBounds(bounds.pad(0.25));
    if (view) {
      const fitZoom = this.map.getBoundsZoom(bounds);
      const zoom = Math.max(this.map.getMinZoom(), Math.min(this.map.getMaxZoom(), fitZoom + Math.log2(view.zoom)));
      this.map.setView([image.height * (1 - view.centerY), image.width * view.centerX], zoom, { animate: false });
    }
    this.restoringView = false;
    this.publishView();
  }

  setWaterAnimated(animated: boolean): void {
    this.waterAnimated = animated;
    this.water?.setAnimated(animated);
  }

  /** Adds, moves, restyles and removes pins to match `markers`. */
  syncMarkers(markers: readonly WorldmapMarker[]): void {
    const image = this.image;
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
      const existing = this.pins.get(marker.id);
      if (existing) {
        const position = L.latLng(toLatLng(marker.x, marker.y, image));
        // Moving a pin makes Leaflet rebuild its open popup, so only move pins that actually moved.
        if (!existing.getLatLng().equals(position)) {
          existing.setLatLng(position);
        }
        existing.setIcon(styledPin(marker));
        existing.setTooltipContent(labelHtml(marker));
        existing.setOpacity(marker.visible ? 1 : 0.45);
        existing.options.title = marker.name;
      } else {
        this.pins.set(marker.id, this.createPin(marker, image));
      }
    }
  }

  hasPin(id: string): boolean {
    return this.pins.has(id);
  }

  /** Centres the map on a marker and opens its popup. */
  focus(id: string): void {
    const pin = this.pins.get(id);
    if (pin) {
      this.map.panTo(pin.getLatLng());
      pin.openPopup();
    }
  }

  openPopup(id: string): void {
    this.pins.get(id)?.openPopup();
  }

  closePopup(id: string): void {
    this.pins.get(id)?.closePopup();
  }

  destroy(): void {
    this.water?.destroy();
    this.map.remove();
  }

  private createPin(marker: WorldmapMarker, image: WorldmapImage): L.Marker {
    const pin = L.marker(toLatLng(marker.x, marker.y, image), {
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
      .bindPopup(() => this.popupContent(marker.id), {
        className: 'marker-popup-frame',
        closeButton: false,
        minWidth: 233,
        maxWidth: 233,
        offset: [0, -4],
      })
      .addTo(this.map);
    pin.on('popupopen', () => this.events.popupOpened(marker.id));
    pin.on('popupclose', () => this.events.popupClosed(marker.id));
    pin.on('dragend', () => {
      const shown = this.image;
      if (shown) {
        const { x, y } = toImagePoint(pin.getLatLng(), shown);
        this.events.markerMoved(marker.id, x, y);
      }
    });
    return pin;
  }

  private popupContent(id: string): HTMLElement {
    const content = this.events.popupContent(id);
    // Keeps clicks and scrolling inside the popup from reaching the map.
    L.DomEvent.disableClickPropagation(content);
    L.DomEvent.disableScrollPropagation(content);
    return content;
  }

  private removeImage(): void {
    this.waterOverlay?.remove();
    this.waterOverlay = undefined;
    this.water?.destroy();
    this.water = undefined;
    this.overlay?.remove();
    this.overlay = undefined;
  }

  /** Water goes in its own SVG overlay below the map image, so only transparent sea shows it. */
  private addWater(image: WorldmapImage, bounds: L.LatLngBounds): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${image.width} ${image.height}`);
    // Leaflet's stylesheet forces z-index 200 on SVGs in a pane, which would cover the map image.
    svg.style.zIndex = '1';
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    host.setAttribute('width', String(image.width));
    host.setAttribute('height', String(image.height));
    const canvas = document.createElement('canvas');
    canvas.className = 'ui-water';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.append(canvas);
    svg.append(host);
    this.waterOverlay = L.svgOverlay(svg, bounds, { interactive: false, zIndex: 1 }).addTo(this.map);
    this.water = new WaterRenderer(canvas);
    this.water.setAnimated(this.waterAnimated);
    void this.water.load(image.url);
  }

  private publishView(): void {
    const image = this.image;
    if (!image || this.restoringView) {
      return;
    }
    const center = this.map.getCenter();
    const fitZoom = this.map.getBoundsZoom(imageBounds(image));
    this.events.viewChanged({
      centerX: center.lng / image.width,
      centerY: 1 - center.lat / image.height,
      zoom: 2 ** (this.map.getZoom() - fitZoom),
    });
  }

  private fit(bounds: L.LatLngBounds): void {
    this.map.invalidateSize();
    // Leaflet clamps the fitting zoom to the current limits (default min 0), which is too high for large images.
    this.map.setMinZoom(-ZOOM_LIMIT);
    this.map.setMaxZoom(ZOOM_LIMIT);
    const fitZoom = this.map.getBoundsZoom(bounds);
    this.map.setMinZoom(fitZoom - 1);
    this.map.setMaxZoom(fitZoom + 4);
    this.map.fitBounds(bounds, { animate: false });
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

/** Round pin in the marker's colours. Colours are validated hex codes, so they are safe in HTML. */
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
