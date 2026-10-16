import { Component, input, output } from '@angular/core';
import { ModalDialog } from '../modal-dialog/modal-dialog';

export interface IconChoice {
  id: string;
  label: string;
  /** Material Symbols glyph. */
  glyph: string;
}

/** Asks for the title of an uploaded map and, when `icons` are given, which icon represents it. */
@Component({
  selector: 'app-map-upload-dialog',
  imports: [ModalDialog],
  templateUrl: './map-upload-dialog.html',
  styleUrl: './map-upload-dialog.css',
})
export class MapUploadDialog {
  readonly title = input.required<string>();
  readonly icons = input<IconChoice[]>([]);
  readonly icon = input<string | null>(null);
  readonly titleChanged = output<string>();
  readonly iconSelected = output<string>();
  readonly cancelled = output<void>();
  readonly submitted = output<void>();

  protected updateTitle(event: Event): void {
    this.titleChanged.emit((event.target as HTMLInputElement).value);
  }
}
