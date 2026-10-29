import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { PlayerScreen } from '../../battlemap/player-screen/player-screen';
import { WaterCanvas } from '../../../shared/ui/water/water-canvas';
import { WorldmapService } from '../worldmap.service';

@Component({
  selector: 'app-worldmap-player-screen',
  imports: [PlayerScreen, WaterCanvas],
  templateUrl: './player-screen.html',
  styleUrl: './player-screen.css',
  host: {
    '(document:fullscreenchange)': 'syncFullscreen()',
  },
})
export class WorldmapPlayerScreen {
  private readonly document = inject(DOCUMENT);
  private readonly worldmap = inject(WorldmapService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild<ElementRef<SVGSVGElement>>('stage');

  protected readonly current = this.worldmap.playerMap;
  protected readonly linkedBattlemapId = this.worldmap.linkedBattlemapId;
  protected readonly isFullscreen = signal(false);
  private readonly aspect = signal(this.currentAspect());
  protected readonly viewBox = computed(() => {
    const entry = this.current();
    if (!entry) {
      return '';
    }
    const rect = playerRect(
      entry.image.width,
      entry.image.height,
      this.worldmap.playerView(),
      this.aspect(),
    );
    return `${rect.x} ${rect.y} ${rect.width} ${rect.height}`;
  });
  private readonly stageWidth = signal(this.currentWidth());
  /** Map units per screen pixel, so markers keep a constant on-screen size at every zoom level. */
  protected readonly pixel = computed(() => {
    const entry = this.current();
    if (!entry) {
      return 0;
    }
    const rect = playerRect(
      entry.image.width,
      entry.image.height,
      this.worldmap.playerView(),
      this.aspect(),
    );
    return rect.width / Math.max(this.stageWidth(), 1);
  });

  constructor() {
    this.worldmap.startViewer();
    afterNextRender(() => {
      const stage = this.stage()?.nativeElement;
      if (stage) {
        const observer = new ResizeObserver(() => this.reportAspect());
        observer.observe(stage);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
      this.reportAspect();
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

  private reportAspect(): void {
    this.aspect.set(this.currentAspect());
    this.stageWidth.set(this.currentWidth());
  }

  private currentWidth(): number {
    const stage = this.stage()?.nativeElement;
    return stage?.clientWidth || this.document.defaultView?.innerWidth || 0;
  }

  private currentAspect(): number {
    const stage = this.stage()?.nativeElement;
    const width = this.currentWidth();
    const height = stage?.clientHeight || this.document.defaultView?.innerHeight || 0;
    return height > 0 ? width / height : 16 / 9;
  }
}

function playerRect(
  width: number,
  height: number,
  view: { centerX: number; centerY: number; zoom: number },
  aspect: number,
): { x: number; y: number; width: number; height: number } {
  const rectWidth = Math.max(width, height * aspect) / view.zoom;
  const rectHeight = rectWidth / aspect;
  return {
    x: view.centerX * width - rectWidth / 2,
    y: view.centerY * height - rectHeight / 2,
    width: rectWidth,
    height: rectHeight,
  };
}
