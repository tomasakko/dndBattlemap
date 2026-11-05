import { inject } from '@angular/core';
import { BattlemapHost } from '../sync/battlemap.host';

/** Starts publishing the battlemap to the player screen (see `PlayerPresenter.loadHost`). */
export function startBattlemapHost(): void {
  inject(BattlemapHost);
}
