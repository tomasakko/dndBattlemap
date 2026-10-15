import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectService } from '../project.service';
import { TabService } from '../tab.service';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css',
})
export class Topbar {
  protected readonly tabs = inject(TabService);
  private readonly project = inject(ProjectService);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected async save(): Promise<void> {
    try {
      await this.project.save();
    } catch (error) {
      alert('Could not save project: ' + this.message(error));
    }
  }

  protected openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !confirm('Loading "' + file.name + '" replaces the current data of every app in the file. Continue?')) {
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
