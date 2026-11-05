import { Component, input, output } from '@angular/core';

let nextId = 0;

/** A centred modal form with a heading, projected fields and Cancel/Submit buttons (plus an optional third). */
@Component({
  selector: 'app-modal-dialog',
  templateUrl: './modal-dialog.html',
  styleUrl: './modal-dialog.css',
})
export class ModalDialog {
  readonly heading = input.required<string>();
  readonly submitLabel = input('OK');
  /** `null` leaves out the Cancel button (Escape still cancels). */
  readonly cancelLabel = input<string | null>('Cancel');
  /** Adds a button between Cancel and Submit, e.g. "Don't save". */
  readonly secondaryLabel = input<string | null>(null);
  readonly submitted = output<void>();
  readonly secondary = output<void>();
  readonly cancelled = output<void>();

  protected readonly headingId = 'modal-dialog-heading-' + nextId++;
}
