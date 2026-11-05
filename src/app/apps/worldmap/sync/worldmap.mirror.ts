import { Injectable } from '@angular/core';
import { mirrorSignals } from '../../../shared/sync/sync-signals';
import { EMPTY_WORLDMAP_SLICES } from '../domain/projection';
import { WORLDMAP_CHANNEL, WORLDMAP_PROTOCOL, WorldmapSlices } from './protocol';

/** Player side: what the DM's window publishes. Provide it in the player screen, so it closes with it. */
@Injectable()
export class WorldmapMirror {
  private readonly sync = mirrorSignals<WorldmapSlices>(WORLDMAP_CHANNEL, WORLDMAP_PROTOCOL, EMPTY_WORLDMAP_SLICES);

  readonly map = this.sync.state.map;
  readonly markers = this.sync.state.markers;
  readonly view = this.sync.state.view;
  readonly ambientAnimated = this.sync.state.ambientAnimated;
}
