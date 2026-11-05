import {
  ApplicationRef,
  Component,
  ComponentRef,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  computed,
  createComponent,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { MapUploadDialog } from '../../../shared/ui/map-upload-dialog/map-upload-dialog';
import { titleFromFileName } from '../../../shared/util/text';
import { PlayerStageService } from '../../../suite/presentation/player-stage.service';
import { PanelTabsService } from '../../../suite/shell/panel-tabs.service';
import { sortedMarkers } from '../domain/markers';
import { WorldmapStore } from '../state/worldmap.store';
import { worldmapMaps } from '../suite/worldmap.sidebar';
import { BattlemapLinks } from './battlemap-links';
import { WorldmapLeaflet } from './leaflet-map';
import { MarkerPopup } from './marker-popup/marker-popup';

const APP_ID = 'worldmap';

@Component({
  selector: 'app-worldmap-screen',
  imports: [FileButton, MapUploadDialog],
  providers: [BattlemapLinks],
  templateUrl: './worldmap-screen.html',
  styleUrl: './worldmap-screen.css',
})
export class WorldmapScreen {
  private readonly store = inject(WorldmapStore);
  private readonly stage = inject(PlayerStageService);
  private readonly confirm = inject(ConfirmService);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly injector = inject(Injector);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('map');

  protected readonly current = this.store.current;
  protected readonly persistenceError = this.store.persistenceError;
  /** Players see the world map. */
  protected readonly shared = computed(() => this.stage.isShowing(APP_ID));
  protected readonly waterAnimated = this.store.waterAnimated;
  /** Marker whose popup is open; highlighted in the Markers list. */
  protected readonly openMarkerId = signal<string | null>(null);
  protected readonly markersOpen = signal(false);
  protected readonly sortedMarkers = computed(() => sortedMarkers(this.current()?.markers ?? []));
  protected readonly placing = signal(false);
  protected readonly error = signal('');
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly mapTitle = signal('');

  private leaflet?: WorldmapLeaflet;
  private readonly popups = new Map<string, ComponentRef<MarkerPopup>>();
  /**
   * A marker whose popup opens as soon as its pin is drawn: just placed (opens in place), or picked in the
   * search bar (the map centres on it).
   */
  private openWhenDrawn: { id: string; centre: boolean } | null = null;

  constructor() {
    inject(PanelTabsService).register({ appId: APP_ID, ...worldmapMaps(() => this.placing.set(false)) });
    // Back on the world map, a quick look at a linked battlemap is over.
    this.stage.endLink();
    inject(DestroyRef).onDestroy(() => {
      this.popups.forEach((popup) => popup.destroy());
      this.leaflet?.destroy();
    });
    effect(() => {
      const animated = this.waterAnimated();
      untracked(() => this.leaflet?.setWaterAnimated(animated));
    });
    effect(() => {
      const current = this.current();
      const element = this.container().nativeElement;
      untracked(() => {
        const leaflet = (this.leaflet ??= this.createLeaflet(element));
        leaflet.showImage(current?.image ?? null, current ? (this.store.views()[current.id] ?? null) : null);
        leaflet.syncMarkers(current?.markers ?? []);
        this.openPendingPopup();
      });
    });
    // A marker picked elsewhere (the search bar): open it now, or as soon as its pin is drawn.
    effect(() => {
      const id = this.store.markerToFocus();
      this.current();
      if (!id) {
        return;
      }
      untracked(() => {
        if (!this.current()?.markers.some((marker) => marker.id === id)) {
          return;
        }
        this.store.markerToFocus.set(null);
        if (this.leaflet?.hasPin(id)) {
          this.leaflet.focus(id);
        } else {
          this.openWhenDrawn = { id, centre: true };
        }
      });
    });
  }

  protected onFileSelected(file: File): void {
    this.error.set('');
    this.pendingFile.set(file);
    this.mapTitle.set(titleFromFileName(file.name, 'World map'));
  }

  protected cancelUpload(): void {
    this.pendingFile.set(null);
  }

  protected async confirmUpload(): Promise<void> {
    const file = this.pendingFile();
    const name = this.mapTitle().trim();
    if (!file || !name) {
      return;
    }
    try {
      this.error.set('');
      this.placing.set(false);
      await this.store.addMap(file, name);
    } catch {
      this.error.set('That file could not be loaded as an image.');
    } finally {
      this.pendingFile.set(null);
    }
  }

  protected togglePlacing(): void {
    this.placing.update((placing) => !placing);
  }

  /**
   * Shows the world map to the players (opening their window if needed), or hides it.
   * Players see one thing at a time, so this replaces whatever they saw.
   */
  protected toggleShared(): void {
    if (this.shared()) {
      this.stage.hide();
    } else {
      this.stage.present({ app: APP_ID, mapId: null, mode: 'shared' }, { openWindow: true });
    }
  }

  protected toggleWater(): void {
    this.store.setWaterAnimated(!this.waterAnimated());
  }

  /** Centres the map on a marker and opens its popup. */
  protected focusMarker(id: string): void {
    this.leaflet?.focus(id);
  }

  private createLeaflet(element: HTMLElement): WorldmapLeaflet {
    return new WorldmapLeaflet(element, {
      clicked: (x, y) => {
        if (this.placing()) {
          this.placing.set(false);
          const marker = this.store.addMarker(x, y);
          this.openWhenDrawn = marker ? { id: marker.id, centre: false } : null;
        }
      },
      markerMoved: (id, x, y) => this.store.moveMarker(id, x, y),
      viewChanged: (view) => {
        const id = this.store.currentId();
        if (id) {
          this.store.setView(id, view);
        }
      },
      popupContent: (id) => this.createPopup(id),
      popupOpened: (id) => this.openMarkerId.set(id),
      popupClosed: (id) => {
        if (this.openMarkerId() === id) {
          this.openMarkerId.set(null);
        }
        this.popups.get(id)?.destroy();
        this.popups.delete(id);
      },
    });
  }

  /**
   * The popup is an Angular component, attached to the app so it updates like any other view.
   * Leaflet asks for the content again whenever the popup updates; the open popup is reused then.
   */
  private createPopup(id: string): HTMLElement {
    const existing = this.popups.get(id);
    if (existing) {
      return existing.location.nativeElement as HTMLElement;
    }
    const popup = createComponent(MarkerPopup, {
      environmentInjector: this.environmentInjector,
      elementInjector: this.injector,
    });
    popup.setInput('markerId', id);
    popup.instance.closed.subscribe(() => this.leaflet?.closePopup(id));
    this.appRef.attachView(popup.hostView);
    popup.changeDetectorRef.detectChanges();
    this.popups.set(id, popup);
    return popup.location.nativeElement as HTMLElement;
  }

  private openPendingPopup(): void {
    const pending = this.openWhenDrawn;
    if (pending && this.leaflet?.hasPin(pending.id)) {
      this.openWhenDrawn = null;
      if (pending.centre) {
        this.leaflet.focus(pending.id);
      } else {
        this.leaflet.openPopup(pending.id);
      }
    }
  }
}
