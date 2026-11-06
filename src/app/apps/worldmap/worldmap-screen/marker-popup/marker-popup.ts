import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import {
  MARKER_FONTS,
  MARKER_ICON_SECTIONS,
  MARKER_SIZES,
  MarkerStyle,
  markerFont,
  markerIconLabel,
} from '../../domain/marker-style';
import { MarkerGlyph } from '../../marker-glyph/marker-glyph';
import { WorldmapStore } from '../../state/worldmap.store';
import { BattlemapLinks } from '../battlemap-links';

type ColorKey = 'color' | 'border';
type OptionKey = 'font' | 'size';

const HEX = /^#[0-9a-f]{6}$/i;

/** A marker's popup on the DM's world map: name, visibility, look, and a linked battlemap. */
@Component({
  selector: 'app-marker-popup',
  imports: [MarkerGlyph],
  templateUrl: './marker-popup.html',
  styleUrl: './marker-popup.css',
})
export class MarkerPopup {
  private readonly store = inject(WorldmapStore);
  protected readonly links = inject(BattlemapLinks);

  readonly markerId = input.required<string>();
  /** The popup's close button was pressed. */
  readonly closed = output<void>();
  /** The popup grew or shrank (the icon grid opened or closed). */
  readonly resized = output<void>();

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

  /** The icon grid is open under the Icon field. */
  protected readonly iconsOpen = signal(false);
  /** Text typed in the icon search field. */
  protected readonly iconQuery = signal('');
  /** Icon sections filtered by the search: every typed word must appear in the icon's or its section's name. */
  protected readonly iconSections = computed(() => {
    const words = this.iconQuery().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
      return MARKER_ICON_SECTIONS;
    }
    return MARKER_ICON_SECTIONS.map((section) => ({
      label: section.label,
      icons: section.icons.filter((icon) => {
        const text = `${icon.label} ${icon.id.replace(/-/g, ' ')} ${section.label}`.toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    })).filter((section) => section.icons.length > 0);
  });
  private readonly iconSearch = viewChild<ElementRef<HTMLInputElement>>('iconSearch');

  constructor() {
    // Put the cursor in the search field as soon as the grid opens.
    effect(() => this.iconSearch()?.nativeElement.focus());
  }

  protected toggleIcons(): void {
    this.iconsOpen.update((open) => !open);
    this.iconQuery.set('');
    this.resized.emit();
  }

  protected searchIcons(value: string): void {
    this.iconQuery.set(value);
    this.resized.emit();
  }

  /** Keys typed in the search must not move the map; Escape clears it, then closes the grid. */
  protected onSearchKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      if (this.iconQuery()) {
        this.searchIcons('');
      } else {
        this.toggleIcons();
      }
    }
  }
  protected readonly iconLabel = computed(() => {
    const marker = this.marker();
    return marker ? markerIconLabel(marker) : '';
  });
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

  protected pickIcon(icon: string): void {
    this.store.setMarkerStyle(this.markerId(), { icon });
    this.iconsOpen.set(false);
    this.iconQuery.set('');
    this.resized.emit();
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
