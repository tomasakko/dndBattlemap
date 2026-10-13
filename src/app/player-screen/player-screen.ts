import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { BattlemapService, viewBoxFor, viewRect } from '../services/battlemap.service';
import { InitiativeService } from '../services/initiative.service';
import { CreatureService } from '../services/creature.service';
import { PlayerInitiativeBar } from './player-initiative-bar/player-initiative-bar';

@Component({
  selector: 'app-player-screen',
  imports: [PlayerInitiativeBar],
  templateUrl: './player-screen.html',
  styleUrl: './player-screen.css',
  host: {
    '(document:fullscreenchange)': 'syncFullscreen()',
    '(window:resize)': 'reportAspect()',
    '(window:keydown)': 'onKeydown($event)',
  },
})
export class PlayerScreen {
  private readonly document = inject(DOCUMENT);
  private readonly battlemap = inject(BattlemapService);
  private readonly initiative = inject(InitiativeService);
  private readonly creatures = inject(CreatureService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly map = this.battlemap.map;
  protected readonly isFullscreen = signal(false);
  private readonly longestSide = computed(() => Math.max(this.map()?.width ?? 1000, this.map()?.height ?? 1000));
  private readonly fogTiles = [createFogTile(7), createFogTile(19)];
  private readonly aspect = signal(this.currentAspect());
  protected readonly viewBox = computed(() => {
    const map = this.map();
    return map ? viewBoxFor(viewRect(map, this.battlemap.view(), this.aspect())) : '';
  });
  /** Soft fog edge and noise scale, relative to the map size so they look the same on any image. */
  protected readonly feather = computed(() => this.longestSide() * 0.008);
  protected readonly tileA = computed(() => this.longestSide() * 0.7);
  protected readonly tileB = computed(() => this.longestSide() * 0.45);
  protected readonly turnOrder = computed(() =>
    this.initiative.ordered().map((c) => ({
      id: c.id,
      name: c.name,
      image: this.creatures.findById(c.type)?.image,
      player: c.side === 'player',
      active: c.id === this.initiative.activeId(),
      down: c.down === true,
    })),
  );
  protected readonly roomViews = computed(() =>
    this.battlemap.rooms().map((room) => ({
      id: room.id,
      revealed: room.revealed,
      points: room.points.map((p) => `${p.x},${p.y}`).join(' '),
    })),
  );

  constructor() {
    this.battlemap.startViewer();
    this.initiative.startViewer();
    this.reportAspect();

    // The map area shrinks when the initiative bar appears, so its own size drives the aspect ratio.
    afterNextRender(() => {
      const stage = this.stage()?.nativeElement;
      if (stage) {
        const observer = new ResizeObserver(() => this.reportAspect());
        observer.observe(stage);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
    });

    effect(() => {
      this.initiative.activeId();
      this.turnOrder();
      setTimeout(() => this.host.nativeElement.querySelector('.combatant.active')?.scrollIntoView({ block: 'nearest' }));
    });
  }

  protected fogTile(layer: 1 | 2): string {
    return this.fogTiles[layer - 1];
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.map() || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest('input, textarea, select, button, a, [contenteditable="true"]'))
    ) {
      return;
    }

    event.preventDefault();
    const step = event.shiftKey ? 0.5 : 0.1;
    const directions: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const [dx, dy] = directions[event.key];
    this.battlemap.requestPan(dx, dy);
  }

  protected reportAspect(): void {
    const ratio = this.currentAspect();
    this.aspect.set(ratio);
    this.battlemap.reportAspect(ratio);
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

  private currentAspect(): number {
    const stage = this.stage()?.nativeElement;
    const width = stage?.clientWidth || this.document.defaultView?.innerWidth || 0;
    const height = stage?.clientHeight || this.document.defaultView?.innerHeight || 0;
    return height > 0 ? width / height : 16 / 9;
  }
}

/** Renders a seamlessly tiling dark-grey cloud texture once, so animating it only moves an image. */
function createFogTile(seed: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">' +
    '<filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="6" stitchTiles="stitch" seed="' + seed + '" />' +
    '<feColorMatrix type="matrix" values="0.6 0 0 0 -0.2  0.6 0 0 0 -0.2  0.64 0 0 0 -0.19  0 0 0 0 1" />' +
    '</filter><rect width="1024" height="1024" filter="url(#f)" /></svg>';
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}
