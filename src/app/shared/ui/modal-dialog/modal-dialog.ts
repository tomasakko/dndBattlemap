import { Component, input, output } from '@angular/core';

let nextId = 0;

/** A centred modal form with a heading, projected fields and Cancel/Submit buttons. */
@Component({
  selector: 'app-modal-dialog',
  templateUrl: './modal-dialog.html',
  styleUrl: './modal-dialog.css',
})
export class ModalDialog {
  readonly heading = input.required<string>();
  readonly submitLabel = input('OK');
  readonly cancelLabel = input('Cancel');
  readonly submitted = output<void>();
  readonly cancelled = output<void>();

  protected readonly headingId = 'modal-dialog-heading-' + nextId++;
}
