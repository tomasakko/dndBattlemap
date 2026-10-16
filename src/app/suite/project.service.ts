import { Injectable, Injector, inject, runInInjectionContext, signal } from '@angular/core';
import type { ProjectSummaryItem } from './app-storage';
import { SUITE_APPS } from './suite-apps';

const PROJECT_APP = 'dnd-suite';
const PROJECT_VERSION = 1;

/** Saves and loads the data of every app that provides an `AppStorage` as one project file. */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  readonly summaries = signal<Record<string, ProjectSummaryItem[]>>({});
  readonly summaryError = signal<string | null>(null);

  private readonly injector = inject(Injector);

  async save(name: string): Promise<void> {
    const apps: Record<string, unknown> = {};
    for (const app of SUITE_APPS) {
      if (app.loadStorage) {
        const storage = await app.loadStorage();
        apps[app.id] = await runInInjectionContext(this.injector, () => storage.export());
      }
    }
    const data = { app: PROJECT_APP, version: PROJECT_VERSION, apps };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async refreshSummaries(): Promise<void> {
    try {
      const summaries: Record<string, ProjectSummaryItem[]> = {};
      for (const app of SUITE_APPS) {
        if (!app.loadStorage) {
          continue;
        }
        const storage = await app.loadStorage();
        if (storage.summary) {
          summaries[app.id] = await runInInjectionContext(this.injector, () => storage.summary!());
        }
      }
      this.summaries.set(summaries);
      this.summaryError.set(null);
    } catch (error) {
      this.summaries.set({});
      this.summaryError.set(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /** Replaces the data of every app that is present in the file. Apps missing from the file are left alone. */
  async load(file: File): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('Not a valid project file');
    }
    const apps = this.appsIn(parsed);
    const entries = SUITE_APPS.filter((app) => app.loadStorage && app.id in apps);
    if (entries.length === 0) {
      throw new Error('This file contains no data for any app');
    }
    for (const app of entries) {
      const storage = await app.loadStorage!();
      await runInInjectionContext(this.injector, () => storage.import(apps[app.id]));
    }
    await this.refreshSummaries();
  }

  private appsIn(parsed: unknown): Record<string, unknown> {
    const data = parsed as { app?: unknown; apps?: unknown; battlemap?: unknown; initiative?: unknown } | null;
    if (data && data.app === PROJECT_APP && data.apps && typeof data.apps === 'object') {
      return data.apps as Record<string, unknown>;
    }
    // Battlemap-only saves from before the suite existed.
    const legacy = data?.battlemap as { maps?: { id: string; initiative?: unknown }[]; currentId?: string } | undefined;
    if (legacy && Array.isArray(legacy.maps)) {
      // Even older files kept initiative global instead of per map.
      if (data?.initiative && legacy.currentId) {
        const current = legacy.maps.find((map) => map.id === legacy.currentId);
        if (current && !current.initiative) {
          current.initiative = data.initiative;
        }
      }
      return { battlemap: legacy };
    }
    throw new Error('Not a project file');
  }
}
