import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PlayerStageService } from '../../../suite/presentation/player-stage.service';
import type { PanelTab } from '../../../suite/shell/panel-tabs.service';
import { SuiteMapsService } from '../../../suite/shell/suite-maps.service';
import { suiteApp } from '../../../suite/suite-apps';

/** The app a marker can link to. Reached through the suite's map registry, never imported directly. */
const LINK_APP = 'battlemap';

/**
 * Markers can link to a battlemap. Opening the link switches the DM to that battlemap and gives the players
 * a quick, player-safe look at it. Provide it in the Worldmap screen.
 */
@Injectable()
export class BattlemapLinks {
  private readonly suiteMaps = inject(SuiteMapsService);
  private readonly stage = inject(PlayerStageService);
  private readonly router = inject(Router);
  private readonly source = computed(() => this.suiteMaps.sources()[LINK_APP] ?? null);

  /** Battlemaps a marker can link to. */
  readonly targets = computed<PanelTab[]>(() => this.source()?.tabs() ?? []);

  constructor() {
    void this.suiteMaps.load(LINK_APP);
  }

  exists(id: string | null): boolean {
    return !!id && this.targets().some((tab) => tab.id === id);
  }

  /** A battlemap can't be opened while a fight on another one is running. */
  canOpen(id: string | null): boolean {
    const source = this.source();
    return !!source && !!id && this.exists(id) && (!source.locked?.() || source.currentId() === id);
  }

  open(id: string | null): void {
    const source = this.source();
    if (!source || !id || !this.canOpen(id) || !source.select(id)) {
      return;
    }
    this.stage.present({ app: LINK_APP, mapId: id, mode: 'linked' });
    void this.router.navigateByUrl(suiteApp(LINK_APP)?.route ?? '/');
  }
}
