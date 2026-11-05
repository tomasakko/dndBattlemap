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

/**
 * Pin shapes. Only the standard round pin exists so far; the Figma design also lists
 * Castle, Castle Ruins, Cave, Crypt Entrance, Drawbridge, Elven Castle, Gate, Hill Fort,
 * Mountain, Tower and Wall, which get added here once their artwork exists.
 */
export const MARKER_ICONS: readonly MarkerOption[] = [{ id: 'standard', label: 'Standard' }];

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
