import { DEFAULT_VIEW, WorldmapEntry, WorldmapMarker, WorldmapState, WorldmapView, currentWorldmap } from './model';

/** Everything the player screen receives, split so a pan doesn't resend the (large) image. */
export interface WorldmapPlayerSlices {
  map: Pick<WorldmapEntry, 'id' | 'name' | 'image'> | null;
  /** Only the markers players may see. */
  markers: WorldmapMarker[];
  view: WorldmapView;
  ambientAnimated: boolean;
}

export const EMPTY_WORLDMAP_SLICES: WorldmapPlayerSlices = {
  map: null,
  markers: [],
  view: DEFAULT_VIEW,
  ambientAnimated: true,
};

/** What the players may see: the DM's open map, its visible markers, and where the DM is looking. */
export function worldmapPlayerView(
  state: WorldmapState,
  shown: boolean,
  views: Readonly<Record<string, WorldmapView>>,
  ambientAnimated: boolean,
): WorldmapPlayerSlices {
  const entry = shown ? currentWorldmap(state) : null;
  if (!entry) {
    return { ...EMPTY_WORLDMAP_SLICES, ambientAnimated };
  }
  return {
    map: { id: entry.id, name: entry.name, image: entry.image },
    markers: entry.markers.filter((marker) => marker.visible),
    view: views[entry.id] ?? DEFAULT_VIEW,
    ambientAnimated,
  };
}
