import { Service, computed, inject } from '@angular/core';
import { SyncHost } from '../../../shared/sync/sync-channel';
import { publishSignals } from '../../../shared/sync/sync-signals';
import { jsonEqual } from '../../../shared/util/equal';
import { PlayerStageService } from '../../../suite/presentation/player-stage.service';
import { worldmapPlayerView } from '../domain/projection';
import { WorldmapStore } from '../state/worldmap.store';
import { WORLDMAP_CHANNEL, WORLDMAP_PROTOCOL, WorldmapSlices } from './protocol';

/** DM side: publishes the player view of the world map while it is on the stage. */
@Service()
export class WorldmapHost {
  private readonly store = inject(WorldmapStore);
  private readonly stage = inject(PlayerStageService);

  private readonly playerView = computed(() =>
    worldmapPlayerView(
      this.store.snapshot(),
      this.stage.isShowing('worldmap'),
      this.store.views(),
      this.store.waterAnimated(),
    ),
  );

  constructor() {
    void this.store.ensureRestored();
    const host = new SyncHost<WorldmapSlices>(WORLDMAP_CHANNEL, WORLDMAP_PROTOCOL);
    publishSignals(host, {
      // Compared by id and size only: serialising the image's data URL on every change would be slow.
      map: computed(() => this.playerView().map, {
        equal: (a, b) =>
          a === b ||
          (!!a && !!b && a.id === b.id && a.name === b.name && a.image.url === b.image.url),
      }),
      markers: computed(() => this.playerView().markers, { equal: jsonEqual }),
      view: computed(() => this.playerView().view, { equal: jsonEqual }),
      waterAnimated: computed(() => this.playerView().waterAnimated),
    });
  }
}
