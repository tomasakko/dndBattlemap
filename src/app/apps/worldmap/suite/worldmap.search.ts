import { computed, inject } from '@angular/core';
import type { SearchItem, SearchSource } from '../../../suite/search/search-item';
import { WorldmapStore } from '../state/worldmap.store';

/** World maps and the markers on them. */
export function worldmapSearch(): SearchSource {
  const store = inject(WorldmapStore);
  void store.ensureRestored();
  return {
    items: computed(() =>
      store.maps().flatMap((entry): SearchItem[] => [
        {
          id: 'worldmap:' + entry.id,
          kind: 'map',
          label: entry.name,
          icon: 'language',
          mapKind: 'worldmap',
          route: '/worldmap',
          open: () => void store.selectMap(entry.id),
        },
        ...entry.markers.map(
          (marker): SearchItem => ({
            id: 'worldmap-marker:' + marker.id,
            kind: 'entry',
            label: marker.name,
            icon: 'location_on',
            context: entry.name,
            route: '/worldmap',
            open: () => {
              store.selectMap(entry.id);
              store.focusMarker(marker.id);
            },
          }),
        ),
      ]),
    ),
  };
}
