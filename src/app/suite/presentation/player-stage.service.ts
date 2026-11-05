import { Injector, Service, computed, effect, inject, runInInjectionContext, signal, untracked } from '@angular/core';
import { SyncHost } from '../../shared/sync/sync-channel';
import { localPref } from '../../shared/storage/local-pref';
import { suiteApp } from '../suite-apps';
import { PlayerWindowService } from './player-window.service';
import {
  STAGE_CHANNEL,
  STAGE_PROTOCOL,
  Stage,
  StageState,
  endLink,
  parseStage,
  presentStage,
  sameStage,
} from './stage';

const stagePref = localPref<Stage | null>('dnd-suite-player-stage', null, {
  parse: (raw) => parseStage(JSON.parse(raw)) ?? undefined,
});

/**
 * DM side: the one owner of what the players see. Apps put themselves on the stage; the stage tells the
 * player window which app to show and starts that app's publisher. Use it in the DM window only;
 * the player window follows through `PlayerStageMirror`.
 */
@Service()
export class PlayerStageService {
  private readonly injector = inject(Injector);
  private readonly playerWindow = inject(PlayerWindowService);
  private readonly state = signal<StageState>({ current: stagePref.read(), beforeLink: null });
  private readonly host = new SyncHost<{ stage: Stage | null }>(STAGE_CHANNEL, STAGE_PROTOCOL);
  private readonly startedHosts = new Set<string>();

  readonly stage = computed(() => this.state().current, { equal: sameStage });

  constructor() {
    effect(() => {
      const stage = this.stage();
      stagePref.write(stage);
      this.host.publish('stage', stage);
      if (stage) {
        untracked(() => void this.startHost(stage.app));
      }
    });
  }

  /** Whether players see this app (and this map, when given). */
  isShowing(app: string, mapId?: string | null, mode?: Stage['mode']): boolean {
    const stage = this.stage();
    return (
      stage?.app === app && (mapId === undefined || stage.mapId === mapId) && (mode === undefined || stage.mode === mode)
    );
  }

  /**
   * Shows something to the players, replacing whatever they saw. With `openWindow`, also opens the player
   * window if it isn't open yet; that only works when called straight from a click handler.
   */
  present(stage: Stage, options: { openWindow?: boolean } = {}): void {
    this.state.update((state) => presentStage(state, stage));
    if (options.openWindow) {
      this.playerWindow.open();
    }
  }

  /** Players see the waiting message. */
  hide(): void {
    this.state.update((state) => presentStage(state, null));
  }

  /** Hides the app (or one of its maps) if it is what players see, e.g. because it was deleted. */
  hideIfShowing(app: string, mapId?: string): void {
    if (this.isShowing(app, mapId)) {
      this.hide();
    }
  }

  /** Ends a quick look from a link, returning players to what they saw before it. */
  endLink(): void {
    this.state.update(endLink);
  }

  /** The stage as saved in a project file. */
  exportStage(): Stage | null {
    return this.stage();
  }

  importStage(saved: unknown): void {
    this.state.set({ current: parseStage(saved), beforeLink: null });
  }

  private async startHost(appId: string): Promise<void> {
    const presenter = suiteApp(appId)?.player;
    if (!presenter || this.startedHosts.has(appId)) {
      return;
    }
    this.startedHosts.add(appId);
    try {
      const start = await presenter.loadHost();
      runInInjectionContext(this.injector, start);
    } catch (error) {
      this.startedHosts.delete(appId);
      console.error(`Could not start the player view of ${appId}`, error);
    }
  }
}
