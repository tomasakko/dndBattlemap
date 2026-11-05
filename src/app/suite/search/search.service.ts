import {
  Injectable,
  Injector,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SUITE_APPS } from '../suite-apps';
import type { SearchItem, SearchSource } from './search-item';

export interface SearchResult {
  readonly item: SearchItem;
  /** Grey text after the label. */
  readonly context: string | null;
}

const MAX_RESULTS = 30;

/** Searches what every app offers through `SuiteApp.loadSearch`. Sources load on first use. */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly sources = signal<SearchSource[]>([]);
  private loading?: Promise<void>;

  private readonly items = computed(() => this.sources().flatMap((source) => source.items()));

  /** Map names used by more than one map, lower-cased, so those maps say which app they're in. */
  private readonly clashingNames = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.items()) {
      if (item.kind === 'map') {
        const key = normalise(item.label);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  });

  load(): Promise<void> {
    this.loading ??= (async () => {
      const sources: SearchSource[] = [];
      for (const app of SUITE_APPS) {
        if (app.loadSearch) {
          const factory = await app.loadSearch();
          sources.push(runInInjectionContext(this.injector, factory));
        }
      }
      this.sources.set(sources);
    })();
    return this.loading;
  }

  /** Matches anywhere in the name; names starting with the query come first, maps before what's on them. */
  search(query: string): SearchResult[] {
    const q = normalise(query);
    if (!q) return [];
    const clashing = this.clashingNames();
    return this.items()
      .map((item) => ({ item, at: normalise(item.label).indexOf(q) }))
      .filter(({ at }) => at >= 0)
      .sort(
        (a, b) =>
          Number(a.at !== 0) - Number(b.at !== 0) ||
          Number(a.item.kind !== 'map') - Number(b.item.kind !== 'map') ||
          a.item.label.localeCompare(b.item.label),
      )
      .slice(0, MAX_RESULTS)
      .map(({ item }) => ({
        item,
        context:
          item.context ??
          (item.kind === 'map' && item.mapKind && clashing.has(normalise(item.label))
            ? item.mapKind
            : null),
      }));
  }

  open(item: SearchItem): void {
    if (item.disabledNote) return;
    item.open();
    void this.router.navigateByUrl(item.route);
  }
}

function normalise(text: string): string {
  return text.trim().toLocaleLowerCase();
}
