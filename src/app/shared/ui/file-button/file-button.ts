import { Component, input, output } from '@angular/core';

let nextId = 0;

/** A button-styled file picker. Emits the chosen file and resets itself so the same file can be picked again. */
@Component({
  selector: 'app-file-button',
  templateUrl: './file-button.html',
  styleUrl: './file-button.css',
})
export class FileButton {
  readonly label = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly accept = input('image/*');
  readonly fileSelected = output<File>();

  protected readonly inputId = 'file-button-' + nextId++;

  protected onChange(event: Event): void {
    const element = event.target as HTMLInputElement;
    const file = element.files?.[0];
    element.value = '';
    if (file) {
      this.fileSelected.emit(file);
    }
  }
}
