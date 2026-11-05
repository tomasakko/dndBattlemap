import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CreatureService } from '../../../shared/creatures/creature.service';
import { pointsAttr } from '../domain/rooms';
import { viewBoxFor, viewRect } from '../domain/viewport';
import { BattlemapMirror } from '../sync/battlemap.mirror';
import { PlayerInitiativeBar } from './player-initiative-bar/player-initiative-bar';

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** What players see of the battlemap: the map under animated fog, and the turn order if the DM shares it. */
@Component({
  selector: 'app-battlemap-player-screen',
  imports: [PlayerInitiativeBar],
  providers: [BattlemapMirror],
  templateUrl: './player-screen.html',
  styleUrl: './player-screen.css',
  host: {
    '(window:resize)': 'reportAspect()',
    '(window:keydown)': 'onKeydown($event)',
  },
})
export class BattlemapPlayerScreen {
  private readonly document = inject(DOCUMENT);
  private readonly mirror = inject(BattlemapMirror);
  private readonly creatures = inject(CreatureService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly map = this.mirror.image;
  private readonly longestSide = computed(() => Math.max(this.map()?.width ?? 1000, this.map()?.height ?? 1000));
  private readonly fogTiles = [createFogTile(7), createFogTile(19)];
  private readonly aspect = signal(this.currentAspect());
  protected readonly viewBox = computed(() => {
    const map = this.map();
    const view = this.mirror.view();
    return map && view ? viewBoxFor(viewRect(map, view, this.aspect())) : '';
  });
  /** Soft fog edge and noise scale, relative to the map size so they look the same on any image. */
  protected readonly feather = computed(() => this.longestSide() * 0.008);
  protected readonly tileA = computed(() => this.longestSide() * 0.7);
  protected readonly tileB = computed(() => this.longestSide() * 0.45);
  protected readonly turnOrder = computed(() => {
    const initiative = this.mirror.initiative();
    if (!initiative) {
      return null;
    }
    return [...initiative.combatants]
      .sort((a, b) => b.initiative - a.initiative)
      .map((c) => ({
        id: c.id,
        name: c.name,
        image: this.creatures.findById(c.type)?.image,
        player: c.side === 'player',
        active: c.id === initiative.activeId,
        down: c.down,
      }));
  });
  protected readonly roomViews = computed(() =>
    this.mirror.rooms().map((room) => ({ id: room.id, revealed: room.revealed, points: pointsAttr(room.points) })),
  );

  constructor() {
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

    this.destroyRef.onDestroy(() => this.fogTiles.forEach((url) => URL.revokeObjectURL(url)));

    effect(() => {
      this.turnOrder();
      setTimeout(() => this.host.nativeElement.querySelector('.combatant.active')?.scrollIntoView({ block: 'nearest' }));
    });
  }

  protected fogTile(layer: 1 | 2): string {
    return this.fogTiles[layer - 1];
  }

  /** Arrow keys move the view (Shift: further); the DM's window decides where it ends up. */
  protected onKeydown(event: KeyboardEvent): void {
    const direction = ARROW_STEPS[event.key];
    if (!this.map() || !direction) {
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
    this.mirror.requestPan(direction[0] * step, direction[1] * step);
  }

  protected reportAspect(): void {
    const ratio = this.currentAspect();
    this.aspect.set(ratio);
    this.mirror.reportAspect(ratio);
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
