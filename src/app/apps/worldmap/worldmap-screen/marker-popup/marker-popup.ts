import { Component, computed, inject, input, output } from '@angular/core';
import {
  MARKER_FONTS,
  MARKER_ICONS,
  MARKER_SIZES,
  MarkerStyle,
  markerFont,
} from '../../domain/marker-style';
import { WorldmapStore } from '../../state/worldmap.store';
import { BattlemapLinks } from '../battlemap-links';

type ColorKey = 'color' | 'border';
type OptionKey = 'icon' | 'font' | 'size';

const HEX = /^#[0-9a-f]{6}$/i;

/** A marker's popup on the DM's world map: name, visibility, look, and a linked battlemap. */
@Component({
  selector: 'app-marker-popup',
  templateUrl: './marker-popup.html',
  styleUrl: './marker-popup.css',
})
export class MarkerPopup {
  private readonly store = inject(WorldmapStore);
  protected readonly links = inject(BattlemapLinks);

  readonly markerId = input.required<string>();
  /** The popup's close button was pressed. */
  readonly closed = output<void>();

  protected readonly marker = computed(
    () => this.store.current()?.markers.find((m) => m.id === this.markerId()) ?? null,
  );
  /** Unique ids, so each label points at its own field even with several popups in the page. */
  protected readonly ids = computed(() => {
    const prefix = 'mp-' + this.markerId() + '-';
    return {
      icon: prefix + 'icon',
      font: prefix + 'font',
      size: prefix + 'size',
      color: prefix + 'color',
      border: prefix + 'border',
      battlemap: prefix + 'battlemap',
    };
  });
  protected readonly visibilityLabel = computed(() =>
    this.marker()?.visible ? 'Visible to players – click to hide' : 'Hidden from players – click to show',
  );
  protected readonly font = computed(() => {
    const marker = this.marker();
    return marker ? markerFont(marker) : MARKER_FONTS[0];
  });
  /** A link to a battlemap that has since been deleted. */
  protected readonly brokenLink = computed(() => {
    const id = this.marker()?.battlemapId ?? null;
    return !!id && !this.links.exists(id);
  });

  protected readonly icons = MARKER_ICONS;
  protected readonly fonts = MARKER_FONTS;
  protected readonly sizes = MARKER_SIZES;

  protected rename(value: string): void {
    this.store.renameMarker(this.markerId(), value);
  }

  /** Keys typed in the name must not move the map; Enter keeps the name. */
  protected onTitleKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      const field = event.target as HTMLInputElement;
      this.rename(field.value);
      field.blur();
    }
  }

  protected toggleVisible(): void {
    const marker = this.marker();
    if (marker) {
      this.store.setMarkerVisibility(marker.id, !marker.visible);
    }
  }

  protected remove(): void {
    this.store.removeMarker(this.markerId());
  }

  protected setOption(key: OptionKey, event: Event): void {
    const style: Partial<MarkerStyle> = { [key]: (event.target as HTMLSelectElement).value };
    this.store.setMarkerStyle(this.markerId(), style);
  }

  protected pickColor(key: ColorKey, event: Event): void {
    this.store.setMarkerStyle(this.markerId(), { [key]: (event.target as HTMLInputElement).value });
  }

  /** A typed hex code, with or without "#". Invalid codes snap back to the current colour. */
  protected typeColor(key: ColorKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const typed = '#' + field.value.replace(/^#/, '').trim();
    if (HEX.test(typed)) {
      this.store.setMarkerStyle(this.markerId(), { [key]: typed.toLowerCase() });
    }
    field.value = this.hex(this.marker()?.[key] ?? '#000000');
  }

  protected hex(color: string): string {
    return color.slice(1).toUpperCase();
  }

  protected setBattlemap(event: Event): void {
    this.store.setMarkerBattlemap(this.markerId(), (event.target as HTMLSelectElement).value || null);
  }

  protected openBattlemap(): void {
    this.links.open(this.marker()?.battlemapId ?? null);
  }
}
