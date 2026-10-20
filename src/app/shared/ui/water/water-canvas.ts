import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { WaterRenderer } from './water-renderer';

/** Animated sea that follows the coastline of the given (transparent) map image. Fills its parent. */
@Component({
  selector: 'app-water-canvas',
  template: '<canvas #canvas class="ui-water" aria-hidden="true"></canvas>',
  styles: `
    :host,
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class WaterCanvas {
  readonly src = input.required<string>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    let renderer: WaterRenderer | undefined;
    effect(() => {
      const src = this.src();
      renderer ??= new WaterRenderer(this.canvas().nativeElement);
      void renderer.load(src);
    });
    inject(DestroyRef).onDestroy(() => renderer?.destroy());
  }
}
