import { DOCUMENT, NgComponentOutlet } from '@angular/common';
import { Component, DestroyRef, Type, effect, inject, signal, untracked } from '@angular/core';
import { mirrorSignals } from '../../shared/sync/sync-signals';
import { suiteApp } from '../suite-apps';
import { PlayerLoading, PlayerLoadingScreen } from './player-loading';
import { STAGE_CHANNEL, STAGE_PROTOCOL, Stage, parseStage } from './stage';

/** The loading screen stays at least this long, so players can read it. */
const MIN_LOADING_MS = 2500;

/**
 * The player window: follows the DM's stage and shows that app's player screen.
 * Each app's player screen is loaded only when it is first shown.
 */
@Component({
  selector: 'app-player-shell',
  imports: [NgComponentOutlet, PlayerLoadingScreen],
  host: {
    '(document:fullscreenchange)': 'syncFullscreen()',
  },
  template: `
    @if (screen(); as component) {
      <ng-container *ngComponentOutlet="component" />
    } @else {
      <main class="waiting">
        <p role="status">Waiting for the Dungeon Master.</p>
      </main>
    }
    <button type="button" class="fullscreen" (click)="toggleFullscreen()">
      {{ isFullscreen() ? 'Exit full screen' : 'Full screen' }}
    </button>
    @if (loading(); as message) {
      <app-player-loading [loading]="message" />
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }

    .waiting {
      display: grid;
      height: 100%;
      place-items: center;
    }

    /* Revealed on hover so it doesn't cover the player view. */
    .fullscreen {
      position: fixed;
      z-index: 10;
      top: 0.75rem;
      right: 0.75rem;
      opacity: 0;
    }

    .fullscreen:hover,
    .fullscreen:focus-visible {
      opacity: 1;
    }
  `,
})
export class PlayerShell {
  private readonly document = inject(DOCUMENT);
  private readonly stage = mirrorSignals<{ stage: Stage | null }>(STAGE_CHANNEL, STAGE_PROTOCOL, { stage: null })
    .state.stage;
  protected readonly screen = signal<Type<unknown> | null>(null);
  protected readonly loading = signal<PlayerLoading | null>(null);
  protected readonly isFullscreen = signal(false);
  private shownApp: string | null = null;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private switchCount = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.hideTimer));
    effect(() => {
      const stage = parseStage(this.stage());
      untracked(() => void this.show(stage));
    });
  }

  protected syncFullscreen(): void {
    this.isFullscreen.set(!!this.document.fullscreenElement);
  }

  protected toggleFullscreen(): void {
    if (this.document.fullscreenElement) {
      void this.document.exitFullscreen();
    } else {
      void this.document.documentElement.requestFullscreen();
    }
  }

  private async show(stage: Stage | null): Promise<void> {
    const appId = stage?.app ?? null;
    if (appId === this.shownApp) {
      return;
    }
    const first = this.shownApp === null && this.screen() === null && this.switchCount === 0;
    this.shownApp = appId;
    const switchId = ++this.switchCount;
    const presenter = appId ? suiteApp(appId)?.player : undefined;
    if (!presenter) {
      this.screen.set(null);
      return;
    }
    // A quick look from a link, and the very first screen, appear straight away.
    const announce = !first && stage?.mode !== 'linked';
    const started = Date.now();
    if (announce) {
      clearTimeout(this.hideTimer);
      this.loading.set(presenter.loading);
    }
    try {
      const component = await presenter.loadScreen();
      if (switchId === this.switchCount) {
        this.screen.set(component);
      }
    } catch (error) {
      console.error(`Could not load the player screen of ${appId}`, error);
    } finally {
      if (announce && switchId === this.switchCount) {
        this.hideTimer = setTimeout(
          () => this.loading.set(null),
          Math.max(0, MIN_LOADING_MS - (Date.now() - started)),
        );
      }
    }
  }
}
