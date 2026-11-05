import { Component, output } from '@angular/core';
import { ModalDialog } from '../../shared/ui/modal-dialog/modal-dialog';

/** Opened from the help icon in the top right. For now it only credits the icon set. */
@Component({
  selector: 'app-help-dialog',
  imports: [ModalDialog],
  template: `
    <app-modal-dialog
      heading="Help"
      submitLabel="Close"
      [cancelLabel]="null"
      (submitted)="closed.emit()"
      (cancelled)="closed.emit()"
    >
      <section>
        <h3>Credits</h3>
        <p>
          Icons by Lorc, Delapouite and contributors from
          <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>,
          licensed under
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener"
            >CC BY 3.0</a
          >.
        </p>
      </section>
    </app-modal-dialog>
  `,
  styles: `
    h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
    }

    p {
      margin: 0;
    }

    a {
      color: inherit;
      text-decoration: underline;
    }

    a:focus-visible {
      outline: 2px solid var(--color-text);
      outline-offset: 2px;
    }
  `,
})
export class HelpDialog {
  readonly closed = output<void>();
}
