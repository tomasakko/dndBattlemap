import { Injectable } from '@angular/core';
import { mirrorSignals } from '../../../shared/sync/sync-signals';
import { EMPTY_PLAYER_SLICES } from '../domain/projection';
import { BATTLEMAP_CHANNEL, BATTLEMAP_PROTOCOL, BattlemapCommand, BattlemapSlices } from './protocol';

/** Player side: what the DM's window publishes. Provide it in the player screen, so it closes with it. */
@Injectable()
export class BattlemapMirror {
  private readonly sync = mirrorSignals<BattlemapSlices, BattlemapCommand>(
    BATTLEMAP_CHANNEL,
    BATTLEMAP_PROTOCOL,
    EMPTY_PLAYER_SLICES,
  );

  readonly image = this.sync.state.image;
  readonly view = this.sync.state.view;
  readonly rooms = this.sync.state.rooms;
  readonly initiative = this.sync.state.initiative;

  reportAspect(ratio: number): void {
    this.sync.mirror.send({ type: 'aspect', ratio });
  }

  requestPan(dx: number, dy: number): void {
    this.sync.mirror.send({ type: 'pan', dx, dy });
  }
}
