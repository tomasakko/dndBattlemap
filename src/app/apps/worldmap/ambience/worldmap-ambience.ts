import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, signal } from '@angular/core';
import { AmbienceScene } from './ambience-scene';

/** The ambient animation layer as a component; it fills its positioned parent and lets clicks through. */
@Component({
  selector: 'app-worldmap-ambience',
  template: '',
  styles: ':host { position: absolute; inset: 0; display: block; }',
})
export class WorldmapAmbience {
  readonly animated = input(true);

  private readonly scene = signal<AmbienceScene | null>(null);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // Browser only: there is nothing to animate during server rendering.
    afterNextRender(() => this.scene.set(new AmbienceScene(host)));
    effect(() => this.scene()?.setRunning(this.animated()));
    inject(DestroyRef).onDestroy(() => this.scene()?.destroy());
  }
}
