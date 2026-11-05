import { Component, input } from '@angular/core';
import type { PlayerLoading } from './player-window.service';

/** Covers the player screen while it switches to another app. */
@Component({
  selector: 'app-player-loading',
  template: `
    <div class="loading" role="status" aria-live="assertive">
      <span class="icon" aria-hidden="true">{{ loading().icon }}</span>
      <p class="title">{{ loading().title }}<span class="dots" aria-hidden="true"></span></p>
      @if (loading().subtitle; as subtitle) {
        <p class="subtitle">{{ subtitle }}</p>
      }
    </div>
  `,
  styles: `
    .loading {
      position: fixed;
      z-index: 5000;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 12px;
      padding: 24px;
      background: var(--color-bg);
      color: var(--color-text);
      text-align: center;
      animation: fade-in 250ms ease-out;
    }

    .icon {
      width: 64px;
      height: 64px;
      font-size: 64px;
      animation: pulse 1.6s ease-in-out infinite;
    }

    p {
      margin: 0;
    }

    .title {
      font-size: clamp(20px, 3vw, 32px);
    }

    .subtitle {
      color: var(--color-placeholder);
      font-size: clamp(16px, 2vw, 22px);
    }

    /* "…" that fills in one dot at a time. */
    .dots::after {
      content: '';
      display: inline-block;
      width: 1.2em;
      text-align: left;
      animation: dots 1.2s steps(4, end) infinite;
    }

    @keyframes dots {
      0% {
        content: '';
      }
      25% {
        content: '.';
      }
      50% {
        content: '..';
      }
      75% {
        content: '...';
      }
    }

    @keyframes pulse {
      50% {
        transform: scale(1.12);
        opacity: 0.7;
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .loading,
      .icon,
      .dots::after {
        animation: none;
      }

      .dots::after {
        content: '...';
      }
    }
  `,
})
export class PlayerLoadingScreen {
  readonly loading = input.required<PlayerLoading>();
}
