import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import { ProjectService } from '../project.service';

/** Project name with a dropdown for saving and loading the project file. */
@Component({
  selector: 'app-project-menu',
  templateUrl: './project-menu.html',
  styleUrl: './project-menu.css',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class ProjectMenu {
  /** Player screen of the open app, offered in the menu when there is one. */
  readonly playerUrl = input<string | null>(null);

  protected readonly project = inject(ProjectService);
  private readonly confirm = inject(ConfirmService);
  private readonly menu = viewChild.required<ElementRef<HTMLDetailsElement>>('menu');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected close(): void {
    this.menu().nativeElement.open = false;
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const menu = this.menu().nativeElement;
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  }

  protected async save(): Promise<void> {
    this.close();
    const name = prompt('Choose a name for the project file:', this.project.name())?.trim();
    if (!name) {
      return;
    }
    try {
      await this.project.save(name);
    } catch (error) {
      alert('Could not save project: ' + this.message(error));
    }
  }

  protected openPlayerScreen(url: string): void {
    this.close();
    window.open(url, '_blank', 'noopener');
  }

  protected openFilePicker(): void {
    this.close();
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const message = 'Loading "' + file.name + '" replaces the current data of every app in the file. Continue?';
    if (!(await this.confirm.ask(message, 'Load'))) {
      return;
    }
    try {
      await this.project.load(file);
    } catch (error) {
      alert('Could not load project: ' + this.message(error));
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
