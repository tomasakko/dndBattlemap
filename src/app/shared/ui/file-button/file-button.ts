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
  /** Material Symbols name; when set, the button shows only the icon and the label becomes its tooltip. */
  readonly icon = input<string | null>(null);
  /** Underlined text followed by the icon, as in the empty-map states. */
  readonly link = input(false);
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
