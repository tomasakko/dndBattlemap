import { Component, input, output } from '@angular/core';
import type { StatEntry } from '../../../../shared/creatures/statblock';

export interface EntryChange {
  index: number;
  field: keyof StatEntry;
  value: string;
}

@Component({
  selector: 'app-statblock-entries',
  templateUrl: './statblock-entries.html',
  styleUrl: './statblock-entries.css',
})
export class StatblockEntries {
  readonly title = input.required<string>();
  readonly entries = input.required<StatEntry[]>();
  readonly editing = input(false);
  readonly entryChanged = output<EntryChange>();
  readonly entryAdded = output<void>();
  readonly entryRemoved = output<number>();

  protected updateEntry(index: number, field: keyof StatEntry, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.entryChanged.emit({ index, field, value });
  }
}
