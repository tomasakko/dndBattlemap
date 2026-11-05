import { Service, signal } from '@angular/core';

/** What the user picked: the main button, the optional second one, or Cancel. */
export type ConfirmChoice = 'confirm' | 'secondary' | 'cancel';

export interface ConfirmRequest {
  heading: string;
  message: string;
  confirmLabel: string;
  secondaryLabel: string | null;
  resolve: (choice: ConfirmChoice) => void;
}

/** Asks the user to confirm an action. The question is rendered by `<app-confirm-dialog>` in the app shell. */
@Service()
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  async ask(message: string, confirmLabel = 'Remove'): Promise<boolean> {
    return (await this.choose({ message, confirmLabel })) === 'confirm';
  }

  /** Like `ask`, with an own heading and an optional second choice besides Cancel. */
  choose(options: {
    message: string;
    confirmLabel: string;
    heading?: string;
    secondaryLabel?: string;
  }): Promise<ConfirmChoice> {
    this.request()?.resolve('cancel');
    return new Promise((resolve) =>
      this.request.set({
        heading: options.heading ?? 'Are you sure?',
        message: options.message,
        confirmLabel: options.confirmLabel,
        secondaryLabel: options.secondaryLabel ?? null,
        resolve,
      }),
    );
  }

  answer(choice: ConfirmChoice): void {
    this.request()?.resolve(choice);
    this.request.set(null);
  }
}
