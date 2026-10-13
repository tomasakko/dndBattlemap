import { Component, input, output } from '@angular/core';
import type { MapIcon } from '../../services/battlemap.service';

@Component({
  selector: 'app-map-upload-dialog',
  templateUrl: './map-upload-dialog.html',
})
export class MapUploadDialog {
  readonly title = input.required<string>();
  readonly icon = input.required<MapIcon>();
  readonly titleChanged = output<string>();
  readonly iconSelected = output<MapIcon>();
  readonly cancelled = output<void>();
  readonly submitted = output<void>();

  protected updateTitle(event: Event): void {
    this.titleChanged.emit((event.target as HTMLInputElement).value);
  }
}
