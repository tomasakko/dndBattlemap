import { computed, inject } from '@angular/core';
import type { SearchItem, SearchSource } from '../../suite/search/search-item';
import { WorldmapService } from './worldmap.service';

/** World maps and the markers on them. */
export function worldmapSearch(): SearchSource {
  const worldmap = inject(WorldmapService);
  void worldmap.ensureRestored();
  return {
    items: computed(() =>
      worldmap.maps().flatMap((entry): SearchItem[] => [
        {
          id: 'worldmap:' + entry.id,
          kind: 'map',
          label: entry.name,
          icon: 'language',
          mapKind: 'worldmap',
          route: '/worldmap',
          open: () => worldmap.selectMap(entry.id),
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
              worldmap.selectMap(entry.id);
              worldmap.focusMarker(marker.id);
            },
          }),
        ),
      ]),
    ),
  };
}
