import { Service, signal } from '@angular/core';

export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

/** Asks the user to confirm an action. The question is rendered by `<app-confirm-dialog>` in the app shell. */
@Service()
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(message: string, confirmLabel = 'Remove'): Promise<boolean> {
    this.request()?.resolve(false);
    return new Promise((resolve) => this.request.set({ message, confirmLabel, resolve }));
  }

  answer(confirmed: boolean): void {
    this.request()?.resolve(confirmed);
    this.request.set(null);
  }
}
