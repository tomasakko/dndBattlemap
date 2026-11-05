import { Component, inject } from '@angular/core';
import { ModalDialog } from '../modal-dialog/modal-dialog';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  imports: [ModalDialog],
  template: `
    @if (confirm.request(); as request) {
      <app-modal-dialog
        [heading]="request.heading"
        [submitLabel]="request.confirmLabel"
        [secondaryLabel]="request.secondaryLabel"
        (submitted)="confirm.answer('confirm')"
        (secondary)="confirm.answer('secondary')"
        (cancelled)="confirm.answer('cancel')"
      >
        <p>{{ request.message }}</p>
      </app-modal-dialog>
    }
  `,
  styles: `
    p {
      margin: 0;
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
}
