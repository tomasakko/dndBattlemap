import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { SearchResult, SearchService } from './search.service';

/** The header's search field: finds maps and what's on them across the apps. */
@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.css',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
  },
})
export class SearchBar {
  private readonly search = inject(SearchService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly results = computed<SearchResult[]>(() => this.search.search(this.query()));
  protected readonly showList = computed(() => this.open() && this.query().trim() !== '');

  protected onFocus(): void {
    void this.search.load();
    this.open.set(true);
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count) this.activeIndex.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.activeIndex.update((i) => (i - 1 + count) % count);
        break;
      case 'Enter': {
        const result = this.results()[this.activeIndex()];
        if (result) {
          event.preventDefault();
          this.pick(result);
        }
        break;
      }
      case 'Escape':
        if (this.showList()) {
          event.stopPropagation();
          this.open.set(false);
        } else {
          this.clear();
        }
        break;
    }
  }

  protected pick(result: SearchResult): void {
    if (result.item.disabledNote) return;
    this.search.open(result.item);
    this.clear();
    this.input().nativeElement.blur();
  }

  protected clear(): void {
    this.query.set('');
    this.open.set(false);
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Node && !this.host.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
