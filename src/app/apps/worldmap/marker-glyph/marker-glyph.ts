import { Component, computed, input } from '@angular/core';
import { markerIconPath } from '../domain/marker-style';

/** A marker's icon (or the round pin) at a small fixed size, for lists and the icon picker. */
@Component({
  selector: 'app-marker-glyph',
  template: `
    <svg viewBox="0 0 512 512" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false">
      @if (path(); as d) {
        <path [attr.d]="d" [attr.fill]="color()" [attr.stroke]="border()" stroke-width="40" stroke-linejoin="round" paint-order="stroke" />
      } @else {
        <circle cx="256" cy="256" r="180" [attr.fill]="color()" [attr.stroke]="border()" stroke-width="72" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    svg {
      display: block;
      overflow: visible;
    }
  `,
})
export class MarkerGlyph {
  readonly icon = input.required<string>();
  readonly color = input('#ffffff');
  readonly border = input('#000000');
  readonly size = input(16);

  protected readonly path = computed(() => markerIconPath({ icon: this.icon() }));
}
