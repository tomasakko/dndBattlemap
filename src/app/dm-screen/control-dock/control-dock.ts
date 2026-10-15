import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InitiativePanel } from '../../initiative-panel/initiative-panel';
import type { Room } from '../../services/battlemap.service';
import { PlayerRoster } from '../../player-roster/player-roster';
import { AreaEditor } from '../area-editor/area-editor';

export type PanelId = 'initiative' | 'area' | 'players';
export interface PanelState {
  visible: boolean;
  floating: boolean;
  x: number;
  y: number;
  z: number;
}

export type DockAction = 'share' | 'fit' | 'reset' | 'save' | 'load' | 'initiative-share' | PanelId;

@Component({
  selector: 'app-control-dock',
  imports: [RouterLink, InitiativePanel, AreaEditor, PlayerRoster],
  templateUrl: './control-dock.html',
  styleUrl: './control-dock.css',
})
export class ControlDock {
  readonly panelOrder = input.required<PanelId[]>();
  readonly panels = input.required<Record<PanelId, PanelState>>();
  readonly dockWidth = input.required<number>();
  readonly shared = input.required<boolean>();
  readonly shareDisabled = input.required<boolean>();
  readonly shareLabel = input.required<string>();
  readonly rooms = input.required<Room[]>();
  readonly revealedCount = input.required<number>();
  readonly hasMap = input.required<boolean>();
  readonly initiativeShared = input.required<boolean>();
  readonly initiativeShareLabel = input.required<string>();

  readonly action = output<DockAction>();
  readonly showTip = output<Event>();
  readonly hideTip = output<void>();
  readonly panelDragStart = output<{ id: PanelId; event: PointerEvent }>();
  readonly setAll = output<boolean>();
  readonly renamed = output<{ room: Room; name: string }>();
  readonly toggled = output<Room>();
  readonly removed = output<Room>();
}
