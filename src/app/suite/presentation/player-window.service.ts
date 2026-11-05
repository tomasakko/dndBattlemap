import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { PLAYER_PATH } from './stage';

/** The one browser window players look at. */
const WINDOW_NAME = 'dnd-player-screen';

/** DM side: opens the player window. What it shows is decided by the stage, not by its URL. */
@Service()
export class PlayerWindowService {
  private readonly document = inject(DOCUMENT);

  /** Opens the player window, or leaves an open one as it is. Call straight from a click handler. */
  open(): void {
    const view = this.document.defaultView;
    let win: Window | null = null;
    try {
      win = view?.open('', WINDOW_NAME) ?? null;
    } catch {
      win = null;
    }
    if (!win) {
      // Pop-ups are blocked; an already open player window still follows the stage.
      return;
    }
    let blank = true;
    try {
      blank = win.location.href === 'about:blank';
    } catch {
      blank = false;
    }
    if (blank) {
      win.location.href = PLAYER_PATH;
    }
  }
}
