import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** The one browser window players look at; every app's eye button opens or switches it. */
const WINDOW_NAME = 'dnd-player-screen';
const CHANNEL_NAME = 'dnd-player-window';
/** The loading screen stays at least this long, so players can read it. */
const MIN_LOADING_MS = 2500;

export type PlayerScreenId = 'worldmap' | 'battlemap';

interface PlayerScreen {
  readonly url: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon: string;
}

const PLAYER_SCREENS: Record<PlayerScreenId, PlayerScreen> = {
  worldmap: {
    url: '/worldmap/player',
    title: 'Your Dungeon Master is loading the world map',
    icon: 'language',
  },
  battlemap: {
    url: '/battlemap/player',
    title: 'Your Dungeon Master is loading the battlemap',
    subtitle: 'Prepare for possible battle!',
    icon: 'swords',
  },
};

type Message = { type: 'switch'; screen: PlayerScreenId };

export interface PlayerLoading {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon: string;
}

/**
 * Opens the player screen in its own window, or switches the open one to another app.
 * The player window shows a short loading screen while it switches.
 */
@Injectable({ providedIn: 'root' })
export class PlayerWindowService {
  /** Player side: what the loading screen says while switching, or null. */
  readonly loading = signal<PlayerLoading | null>(null);

  private readonly router = inject(Router);
  private channel?: BroadcastChannel;
  private hideTimer?: ReturnType<typeof setTimeout>;

  /**
   * DM side: shows `screen` to the players. Call straight from a click handler, so the
   * browser allows opening the window.
   */
  show(screen: PlayerScreenId): void {
    const target = PLAYER_SCREENS[screen];
    let win: Window | null = null;
    try {
      win = window.open('', WINDOW_NAME);
    } catch {
      win = null;
    }
    if (!win) {
      // Pop-ups are blocked; an already open player window still hears the switch.
      this.post({ type: 'switch', screen });
      return;
    }
    let path: string | null = null;
    try {
      path = win.location.href === 'about:blank' ? null : win.location.pathname;
    } catch {
      path = null;
    }
    if (path === null) {
      // A new, empty window: load the player screen straight away.
      win.location.href = target.url;
    } else if (path !== target.url) {
      this.post({ type: 'switch', screen });
    }
  }

  /** Player side: follows switches sent by the DM. Safe to call more than once. */
  listen(): void {
    if (this.channel || typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent<Message>) => {
      if (event.data?.type === 'switch') {
        void this.switchTo(event.data.screen);
      }
    };
  }

  private async switchTo(screen: PlayerScreenId): Promise<void> {
    const target = PLAYER_SCREENS[screen];
    if (!target) return;
    clearTimeout(this.hideTimer);
    this.loading.set({ title: target.title, subtitle: target.subtitle, icon: target.icon });
    const started = Date.now();
    try {
      await this.router.navigateByUrl(target.url);
    } finally {
      this.hideTimer = setTimeout(
        () => this.loading.set(null),
        Math.max(0, MIN_LOADING_MS - (Date.now() - started)),
      );
    }
  }

  private post(message: Message): void {
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel ??= new BroadcastChannel(CHANNEL_NAME);
    this.channel.postMessage(message);
  }
}
