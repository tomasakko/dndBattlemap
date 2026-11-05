import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { WorldmapAmbience } from '../ambience/worldmap-ambience';
import { markerFont, markerFontSize } from '../domain/marker-style';
import { viewRect } from '../domain/model';
import { WorldmapMirror } from '../sync/worldmap.mirror';

/** What players see of the world map: the DM's open map, its visible markers, and where the DM is looking. */
@Component({
  selector: 'app-worldmap-player-screen',
  imports: [WorldmapAmbience],
  providers: [WorldmapMirror],
  templateUrl: './player-screen.html',
  styleUrl: './player-screen.css',
})
export class WorldmapPlayerScreen {
  private readonly document = inject(DOCUMENT);
  private readonly mirror = inject(WorldmapMirror);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild<ElementRef<SVGSVGElement>>('stage');

  protected readonly current = this.mirror.map;
  protected readonly markers = this.mirror.markers;
  protected readonly ambientAnimated = this.mirror.ambientAnimated;
  protected readonly font = markerFont;
  protected readonly fontSize = markerFontSize;
  private readonly aspect = signal(16 / 9);
  private readonly stageWidth = signal(0);
  private readonly rect = computed(() => {
    const entry = this.current();
    return entry ? viewRect(entry.image, this.mirror.view(), this.aspect()) : null;
  });
  protected readonly viewBox = computed(() => {
    const rect = this.rect();
    return rect ? `${rect.x} ${rect.y} ${rect.width} ${rect.height}` : '';
  });
  /** Map units per screen pixel, so markers keep a constant on-screen size at every zoom level. */
  protected readonly pixel = computed(() => (this.rect()?.width ?? 0) / Math.max(this.stageWidth(), 1));

  constructor() {
    this.measure();
    afterNextRender(() => {
      const stage = this.stage()?.nativeElement;
      if (stage) {
        const observer = new ResizeObserver(() => this.measure());
        observer.observe(stage);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
      this.measure();
    });
  }

  private measure(): void {
    const stage = this.stage()?.nativeElement;
    const width = stage?.clientWidth || this.document.defaultView?.innerWidth || 0;
    const height = stage?.clientHeight || this.document.defaultView?.innerHeight || 0;
    this.stageWidth.set(width);
    this.aspect.set(height > 0 ? width / height : 16 / 9);
  }
}
