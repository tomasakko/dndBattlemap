import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { THEMES, ThemeService } from '../theme.service';

/** Top-right button with a dropdown for picking the colour theme. */
@Component({
  selector: 'app-theme-menu',
  template: `
    <details #menu class="theme-menu">
      <summary class="icon-btn" aria-label="Theme" title="Theme">
        <span class="icon" aria-hidden="true">palette</span>
      </summary>
      <div class="menu" role="group" aria-label="Theme">
        @for (theme of themes; track theme.id) {
          @let current = theme.id === themeService.themeId();
          <button
            type="button"
            [class.current]="current"
            [attr.aria-pressed]="current"
            (click)="pick(theme.id)"
          >
            <span class="swatch" aria-hidden="true">
              @for (color of theme.swatch; track $index) {
                <span [style.background]="color"></span>
              }
            </span>
            <span class="name">{{ theme.name }}</span>
            @if (current) {
              <span class="icon check" aria-hidden="true">check</span>
            }
          </button>
        }
      </div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }

    .theme-menu {
      position: relative;
    }

    summary {
      display: grid;
      place-items: center;
      list-style: none;
      cursor: pointer;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary:focus-visible {
      outline: 2px solid var(--color-text);
      outline-offset: 2px;
      border-radius: 4px;
    }

    .menu {
      position: absolute;
      z-index: 3000;
      top: calc(100% + 12px);
      right: -8px;
      display: grid;
      min-width: 190px;
      padding: 6px;
      background: var(--color-bg);
      border: 1px solid var(--color-surface);
      border-radius: var(--radius-tab);
      box-shadow: 0 8px 24px rgb(0 0 0 / 40%);
    }

    .menu button {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--color-text);
      text-align: left;
      cursor: pointer;
    }

    .menu button:hover,
    .menu button:focus-visible {
      background: var(--color-surface);
      outline: none;
    }

    .swatch {
      display: flex;
      flex: none;
      overflow: hidden;
      border: 1px solid rgb(255 255 255 / 30%);
      border-radius: 50%;
    }

    .swatch span {
      width: 7px;
      height: 20px;
    }

    .name {
      flex: 1;
    }

    .check {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class ThemeMenu {
  protected readonly themes = THEMES;
  protected readonly themeService = inject(ThemeService);
  private readonly menu = viewChild.required<ElementRef<HTMLDetailsElement>>('menu');

  protected pick(id: string): void {
    this.themeService.set(id);
  }

  protected close(): void {
    this.menu().nativeElement.open = false;
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const menu = this.menu().nativeElement;
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  }
}
