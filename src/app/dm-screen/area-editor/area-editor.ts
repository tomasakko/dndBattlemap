import { Component, computed, input, output, signal } from '@angular/core';
import { Room } from '../../services/battlemap.service';

const GOLDEN_ANGLE = 137.508;

@Component({
  selector: 'app-area-editor',
  templateUrl: './area-editor.html',
  styleUrl: './area-editor.css',
})
export class AreaEditor {
  readonly rooms = input.required<Room[]>();
  readonly revealedCount = input.required<number>();
  readonly setAll = output<boolean>();
  readonly renamed = output<{ room: Room; name: string }>();
  readonly toggled = output<Room>();
  readonly removed = output<Room>();

  protected readonly highlightedId = signal<string | null>(null);
  protected readonly roomViews = computed(() =>
    this.rooms().map((room, index) => ({
      room,
      number: index + 1,
      color: `hsl(${Math.round((index * GOLDEN_ANGLE) % 360)} 85% 55%)`,
    })),
  );

  protected rename(room: Room, event: Event): void {
    this.renamed.emit({ room, name: (event.target as HTMLInputElement).value });
  }
}
