import { Component, input, output } from '@angular/core';
import { ModalDialog } from '../modal-dialog/modal-dialog';

/** Asks for the title of an uploaded map. */
@Component({
  selector: 'app-map-upload-dialog',
  imports: [ModalDialog],
  templateUrl: './map-upload-dialog.html',
})
export class MapUploadDialog {
  readonly title = input.required<string>();
  readonly titleChanged = output<string>();
  readonly cancelled = output<void>();
  readonly submitted = output<void>();

  protected updateTitle(event: Event): void {
    this.titleChanged.emit((event.target as HTMLInputElement).value);
  }
}
