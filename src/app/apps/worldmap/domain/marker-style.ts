import { MARKER_ICON_PATHS } from './marker-icon-art';
import { MARKER_ICON_GROUPS } from './marker-icons';

/** Look of a world map marker: its pin and the name written next to it. */
export interface MarkerStyle {
  icon: string;
  font: string;
  size: string;
  /** Fill of the pin and the name, as #rrggbb. */
  color: string;
  /** Outline of the pin and the name, as #rrggbb. */
  border: string;
}

export interface MarkerOption {
  readonly id: string;
  readonly label: string;
}

/** The plain round pin, drawn in the marker's colours. */
export const STANDARD_MARKER_ICON: MarkerOption = { id: 'standard', label: 'Round pin' };

/** The icon picker's sections: the round pin, then the game-icons.net place icons by kind. */
export const MARKER_ICON_SECTIONS: readonly { readonly label: string; readonly icons: readonly MarkerOption[] }[] = [
  { label: 'Pin', icons: [STANDARD_MARKER_ICON] },
  ...MARKER_ICON_GROUPS,
];

/** Pin shapes: the round pin and every place icon. */
export const MARKER_ICONS: readonly MarkerOption[] = MARKER_ICON_SECTIONS.flatMap((section) => section.icons);

export const MARKER_FONTS: readonly (MarkerOption & { css: string; weight: number })[] = [
  { id: 'bahnschrift', label: 'Bahnschrift', css: "Bahnschrift, 'DIN Alternate', 'Arial Narrow', sans-serif", weight: 700 },
  { id: 'kiwi-maru', label: 'Kiwi Maru', css: "'Kiwi Maru', Georgia, serif", weight: 500 },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, serif', weight: 700 },
  { id: 'courier', label: 'Courier', css: "'Courier New', monospace", weight: 700 },
];

export const MARKER_SIZES: readonly (MarkerOption & { px: number })[] = [
  { id: 'small', label: 'Small', px: 12 },
  { id: 'regular', label: 'Regular', px: 16 },
  { id: 'large', label: 'Large', px: 20 },
  { id: 'huge', label: 'Huge', px: 26 },
];

export const DEFAULT_MARKER_STYLE: MarkerStyle = {
  icon: 'standard',
  font: 'bahnschrift',
  size: 'regular',
  color: '#ffffff',
  border: '#000000',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Fills in defaults for markers saved before styles existed, and drops unknown values. */
export function normaliseMarkerStyle(saved: Partial<MarkerStyle> | null | undefined): MarkerStyle {
  const pick = (value: unknown, options: readonly MarkerOption[], fallback: string): string =>
    typeof value === 'string' && options.some((option) => option.id === value) ? value : fallback;
  const color = (value: unknown, fallback: string): string =>
    typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
  return {
    icon: pick(saved?.icon, MARKER_ICONS, DEFAULT_MARKER_STYLE.icon),
    font: pick(saved?.font, MARKER_FONTS, DEFAULT_MARKER_STYLE.font),
    size: pick(saved?.size, MARKER_SIZES, DEFAULT_MARKER_STYLE.size),
    color: color(saved?.color, DEFAULT_MARKER_STYLE.color),
    border: color(saved?.border, DEFAULT_MARKER_STYLE.border),
  };
}

export function markerFont(style: MarkerStyle): { css: string; weight: number } {
  return MARKER_FONTS.find((font) => font.id === style.font) ?? MARKER_FONTS[0];
}

export function markerFontSize(style: MarkerStyle): number {
  return (MARKER_SIZES.find((size) => size.id === style.size) ?? MARKER_SIZES[1]).px;
}

/** Outline of the marker's icon in a 512 x 512 box, or null for the round pin. */
export function markerIconPath(style: Pick<MarkerStyle, 'icon'>): string | null {
  return MARKER_ICON_PATHS[style.icon] ?? null;
}

export function markerIconLabel(style: Pick<MarkerStyle, 'icon'>): string {
  return (MARKER_ICONS.find((icon) => icon.id === style.icon) ?? STANDARD_MARKER_ICON).label;
}
