import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import type { MapEntry, MapIcon } from '../../services/battlemap.service';

@Component({
  selector: 'app-map-picker',
  templateUrl: './map-picker.html',
  styleUrl: './map-picker.css',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
  },
})
export class MapPicker {
  private readonly dropdown = viewChild<ElementRef<HTMLDetailsElement>>('dropdown');

  readonly maps = input.required<MapEntry[]>();
  readonly currentId = input.required<string | null>();
  readonly currentName = input.required<string>();
  readonly currentIcon = input.required<string | null>();
  readonly sharedId = input.required<string | null>();
  readonly locked = input.required<boolean>();
  readonly selected = output<string>();
  readonly removed = output<{ id: string; name: string }>();

  protected iconName(icon: MapIcon): string {
    return icon === 'city' ? 'location_city' : icon;
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const dropdown = this.dropdown()?.nativeElement;
    if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) {
      dropdown.open = false;
    }
  }
}
