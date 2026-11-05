import { Service, computed, effect, inject, untracked } from '@angular/core';
import { SyncHost } from '../../../shared/sync/sync-channel';
import { publishSignals } from '../../../shared/sync/sync-signals';
import { jsonEqual } from '../../../shared/util/equal';
import { PlayerStageService } from '../../../suite/presentation/player-stage.service';
import type { MapImage } from '../domain/model';
import { BattlemapShown, battlemapPlayerView } from '../domain/projection';
import { panByScreen } from '../domain/viewport';
import { BattlemapStore } from '../state/battlemap.store';
import { InitiativeService } from '../state/initiative.service';
import {
  BATTLEMAP_CHANNEL,
  BATTLEMAP_PROTOCOL,
  BattlemapCommand,
  BattlemapSlices,
  isBattlemapCommand,
} from './protocol';

const APP_ID = 'battlemap';

/**
 * DM side: publishes the player view of the battlemap on the stage. Publishing follows the state,
 * so there are no "broadcast now" calls to forget. Also keeps the stage valid: a deleted map stops
 * being shown, and a linked look ends when the DM switches to another map.
 */
@Service()
export class BattlemapHost {
  private readonly store = inject(BattlemapStore);
  private readonly stage = inject(PlayerStageService);
  private readonly initiative = inject(InitiativeService);

  /** Which battlemap players see, if any. */
  private readonly shown = computed<BattlemapShown | null>(
    () => {
      const stage = this.stage.stage();
      return stage?.app === APP_ID ? { mapId: stage.mapId, linked: stage.mode === 'linked' } : null;
    },
    { equal: jsonEqual },
  );
  private readonly playerView = computed(() =>
    battlemapPlayerView(this.store.snapshot(), this.shown(), this.initiative.defaultHp),
  );

  constructor() {
    void this.store.ensureRestored();
    const host = new SyncHost<BattlemapSlices, BattlemapCommand>(BATTLEMAP_CHANNEL, BATTLEMAP_PROTOCOL, {
      isCommand: isBattlemapCommand,
      onCommand: (command) => this.handle(command),
    });
    publishSignals(host, {
      image: computed(() => this.playerView().image, { equal: sameImage }),
      view: computed(() => this.playerView().view, { equal: jsonEqual }),
      rooms: computed(() => this.playerView().rooms, { equal: jsonEqual }),
      initiative: computed(() => this.playerView().initiative, { equal: jsonEqual }),
    });

    effect(() => {
      const stage = this.stage.stage();
      if (stage?.app !== APP_ID || !this.store.restored()) {
        return;
      }
      const shownId = stage.mapId ?? this.store.currentId();
      const exists = this.store.maps().some((entry) => entry.id === shownId);
      const movedOn = stage.mode === 'linked' && this.store.currentId() !== stage.mapId;
      untracked(() => {
        if (!exists) {
          this.stage.hide();
        } else if (movedOn) {
          this.stage.endLink();
        }
      });
    });
  }

  private handle(command: BattlemapCommand): void {
    const shown = this.shown();
    const entry = this.store.maps().find((m) => m.id === (shown?.mapId ?? this.store.currentId()));
    if (command.type === 'aspect') {
      this.store.playerAspect.set(command.ratio);
      if (entry) {
        this.store.setView(entry.view, entry.id);
      }
    } else if (entry && shown) {
      // Pans the map players see, which isn't necessarily the one the DM has open.
      this.store.setView(panByScreen(entry.map, entry.view, this.store.playerAspect(), command.dx, command.dy), entry.id);
    }
  }
}

/** Compares images without serialising their (multi-megabyte) data URLs. */
function sameImage(a: MapImage | null, b: MapImage | null): boolean {
  return a === b || (!!a && !!b && a.url === b.url && a.width === b.width && a.height === b.height);
}
