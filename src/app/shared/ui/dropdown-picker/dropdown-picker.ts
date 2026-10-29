import { Component, ElementRef, input, output, viewChild } from '@angular/core';

export interface PickerItem {
  id: string;
  label: string;
  /** Optional note after the label, e.g. to flag a shared item. */
  badgeLabel?: string;
}

/** A dropdown listing items; one can be picked and each can be removed. */
@Component({
  selector: 'app-dropdown-picker',
  templateUrl: './dropdown-picker.html',
  styleUrl: './dropdown-picker.css',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
  },
})
export class DropdownPicker {
  private readonly dropdown = viewChild<ElementRef<HTMLDetailsElement>>('dropdown');

  readonly items = input.required<PickerItem[]>();
  readonly currentId = input.required<string | null>();
  readonly label = input.required<string>();
  readonly ariaLabel = input('Choose an item');
  readonly emptyText = input('Nothing to choose');
  readonly removeLabel = input('Remove ');
  /** When set, only the current item can be used and nothing can be removed. */
  readonly locked = input(false);
  readonly lockedNote = input<string | null>(null);
  readonly selected = output<string>();
  readonly removed = output<{ id: string; name: string }>();

  protected closeOnOutsideClick(event: MouseEvent): void {
    const dropdown = this.dropdown()?.nativeElement;
    if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) {
      dropdown.open = false;
    }
  }
}
