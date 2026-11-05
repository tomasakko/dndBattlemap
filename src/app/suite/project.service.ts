import { Injector, Service, inject, runInInjectionContext, signal } from '@angular/core';
import { localPref } from '../shared/storage/local-pref';
import type { AppStorage, ProjectSummaryItem } from './app-storage';
import { PlayerStageService } from './presentation/player-stage.service';
import { SUITE_APPS, SuiteApp } from './suite-apps';

const PROJECT_APP = 'dnd-suite';
/**
 * Project file format.
 * - 1: `{ app, version, apps: { [appId]: data } }` with each app's bare data.
 * - 2: each app's data in its own versioned envelope (see `PersistedState`), plus what players see.
 * Apps read both, so older files keep loading.
 */
const PROJECT_VERSION = 2;
const DEFAULT_NAME = 'Untitled';

const namePref = localPref<string>('dnd-suite-project-name', DEFAULT_NAME, {
  parse: (raw) => raw || undefined,
  serialise: (value) => value,
});

interface ProjectFile {
  app: typeof PROJECT_APP;
  version: number;
  apps: Record<string, unknown>;
  stage?: unknown;
}

/** Saves and loads the data of every app that provides an `AppStorage` as one project file. */
@Service()
export class ProjectService {
  private readonly injector = inject(Injector);
  private readonly stage = inject(PlayerStageService);

  readonly summaries = signal<Record<string, ProjectSummaryItem[]>>({});
  readonly summaryError = signal<string | null>(null);
  /** Shown in the sidebar and used as the file name on save; renamed by the DM or taken from a loaded file. */
  readonly name = signal(namePref.read());

  rename(name: string): void {
    const cleaned = name.replace(/\.json$/i, '').trim() || DEFAULT_NAME;
    this.name.set(cleaned);
    namePref.write(cleaned);
  }

  async save(name: string): Promise<void> {
    const apps: Record<string, unknown> = {};
    for (const { app, storage } of await this.storages()) {
      apps[app.id] = await this.run(() => storage.export());
    }
    const data: ProjectFile = { app: PROJECT_APP, version: PROJECT_VERSION, apps, stage: this.stage.exportStage() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.rename(name);
  }

  async refreshSummaries(): Promise<void> {
    try {
      const summaries: Record<string, ProjectSummaryItem[]> = {};
      for (const { app, storage } of await this.storages()) {
        if (storage.summary) {
          const summary = storage.summary.bind(storage);
          summaries[app.id] = await this.run(summary);
        }
      }
      this.summaries.set(summaries);
      this.summaryError.set(null);
    } catch (error) {
      this.summaries.set({});
      this.summaryError.set(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /** True when any app holds data, i.e. starting over would lose something unsaved. */
  async hasContent(): Promise<boolean> {
    await this.refreshSummaries();
    if (this.summaryError()) {
      return true;
    }
    return Object.values(this.summaries()).some((items) => items.some((item) => item.count > 0));
  }

  /** Empties every app, hides everything from the players, and names the project "Untitled" again. */
  async startNew(): Promise<void> {
    for (const { storage } of await this.storages()) {
      await this.run(() => storage.clear());
    }
    this.stage.hide();
    this.rename(DEFAULT_NAME);
    await this.refreshSummaries();
  }

  /** Replaces the data of every app that is present in the file. Apps missing from the file are left alone. */
  async load(file: File): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('Not a valid project file');
    }
    const project = readProject(parsed);
    const entries = (await this.storages()).filter(({ app }) => app.id in project.apps);
    if (entries.length === 0) {
      throw new Error('This file contains no data for any app');
    }
    for (const { app, storage } of entries) {
      await this.run(() => storage.import(project.apps[app.id]));
    }
    this.stage.importStage(project.stage ?? null);
    this.rename(file.name);
    await this.refreshSummaries();
  }

  private async storages(): Promise<{ app: SuiteApp; storage: AppStorage }[]> {
    const result: { app: SuiteApp; storage: AppStorage }[] = [];
    for (const app of SUITE_APPS) {
      if (app.loadStorage) {
        result.push({ app, storage: await app.loadStorage() });
      }
    }
    return result;
  }

  /** Storage methods `inject()` their app's services. */
  private run<T>(action: () => T): T {
    return runInInjectionContext(this.injector, action);
  }
}

/** Reads every project file version, plus battlemap-only saves from before the suite existed. */
function readProject(parsed: unknown): Pick<ProjectFile, 'apps' | 'stage'> {
  const data = parsed as Partial<ProjectFile> & { battlemap?: unknown; initiative?: unknown };
  if (data && data.app === PROJECT_APP && data.apps && typeof data.apps === 'object') {
    if (typeof data.version === 'number' && data.version > PROJECT_VERSION) {
      throw new Error('This project was saved by a newer version of the app');
    }
    return { apps: data.apps, stage: data.stage };
  }
  const legacy = data?.battlemap;
  if (legacy && typeof legacy === 'object' && Array.isArray((legacy as { maps?: unknown }).maps)) {
    // Even older files kept the open map's initiative next to the battlemap data; the Battlemap app reads it there.
    const battlemap = data.initiative && !('initiative' in legacy) ? { ...legacy, initiative: data.initiative } : legacy;
    return { apps: { battlemap } };
  }
  throw new Error('Not a project file');
}
