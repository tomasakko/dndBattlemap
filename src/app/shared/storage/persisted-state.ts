import { IndexedDbStore, SaveQueue } from './indexed-db-store';

/**
 * Describes one app's saved data format. Every save is stamped with `name` and `version`,
 * so a later version of the app knows exactly what it is reading.
 */
export interface Schema<T> {
  /** Identifies the format, e.g. "battlemap". */
  readonly name: string;
  /** Current version. Bump it and extend `migrate` whenever the saved shape changes. */
  readonly version: number;
  /** Brings data saved by an older version up to `version`. Version 0 means "saved before versioning existed". */
  migrate(data: unknown, fromVersion: number): unknown;
  /** Checks up-to-date data and returns it typed. Throws an Error with a readable message if it is invalid. */
  validate(data: unknown): T;
}

/** How saved data is stored: the data plus what format it is in and when it was written. */
export interface Envelope {
  readonly schema: string;
  readonly version: number;
  readonly savedAt: number;
  readonly data: unknown;
}

export function toEnvelope<T>(schema: Schema<T>, data: T, savedAt = Date.now()): Envelope {
  return { schema: schema.name, version: schema.version, savedAt, data };
}

function isEnvelope(value: unknown, schema: Schema<unknown>): value is Envelope {
  const candidate = value as Partial<Envelope> | null;
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    candidate.schema === schema.name &&
    Number.isInteger(candidate.version) &&
    'data' in candidate
  );
}

/**
 * Reads saved data in any version this schema knows: an envelope, or bare data from before
 * versioning. Throws if the data is invalid or was written by a newer version of the app.
 */
export function fromSaved<T>(schema: Schema<T>, saved: unknown): T {
  const envelope = isEnvelope(saved, schema) ? saved : null;
  const version = envelope?.version ?? 0;
  if (version > schema.version) {
    throw new Error(`This ${schema.name} data was saved by a newer version of the app`);
  }
  const data = envelope ? envelope.data : saved;
  return schema.validate(version === schema.version ? data : schema.migrate(data, version));
}

/** A single text record somewhere: IndexedDB (roomy) or localStorage (small, but always there). */
export interface TextStore {
  readonly available: boolean;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export class LocalStorageText implements TextStore {
  constructor(private readonly key: string) {}

  get available(): boolean {
    try {
      return typeof globalThis.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  async read(): Promise<string | null> {
    return this.available ? localStorage.getItem(this.key) : null;
  }

  async write(value: string): Promise<void> {
    localStorage.setItem(this.key, value);
  }

  async remove(): Promise<void> {
    if (this.available) {
      localStorage.removeItem(this.key);
    }
  }
}

/** An app's saved state: IndexedDB first, localStorage when IndexedDB fails, both in the same versioned format. */
export class PersistedState<T> {
  private readonly saves = new SaveQueue();
  private pending?: { value: () => T; timer: ReturnType<typeof setTimeout> };

  constructor(
    private readonly schema: Schema<T>,
    private readonly primary: TextStore,
    private readonly fallback: TextStore,
  ) {}

  /** IndexedDB database `databaseName`, falling back to localStorage key `localStorageKey`. */
  static browser<T>(schema: Schema<T>, databaseName: string, localStorageKey: string): PersistedState<T> {
    return new PersistedState(schema, new IndexedDbStore(databaseName), new LocalStorageText(localStorageKey));
  }

  /**
   * The saved state, or null when nothing was saved. When both stores hold a copy (a save once had to fall
   * back to localStorage), the newest wins. Throws if the saved data can't be read.
   */
  async load(): Promise<T | null> {
    const [primary, fallback] = await Promise.all([readSafely(this.primary), readSafely(this.fallback)]);
    const candidates = [primary, fallback]
      .filter((raw): raw is string => !!raw)
      .map((raw) => JSON.parse(raw) as unknown);
    if (candidates.length === 0) {
      return null;
    }
    const newest = candidates.reduce((best, next) => (savedAt(next) > savedAt(best) ? next : best));
    const value = fromSaved(this.schema, newest);
    if (fallback && this.primary.available) {
      // Move a localStorage copy (older saves, or a save that fell back) into IndexedDB.
      await this.save(value).catch(() => undefined);
    }
    return value;
  }

  /** Saves now, after any save already running. Resolves when done; rejects if neither store accepted it. */
  save(value: T): Promise<void> {
    this.cancelPending();
    const text = JSON.stringify(toEnvelope(this.schema, value));
    let failure: unknown = null;
    return this.saves
      .enqueue(
        () => this.write(text),
        () => undefined,
        (error) => {
          failure = error;
        },
      )
      .then(() => {
        if (failure) {
          throw failure;
        }
      });
  }

  /** Saves once changes settle (e.g. while dragging). `value` is read when the save happens. */
  saveSoon(value: () => T, delayMs: number, onResult: (error: unknown) => void): void {
    this.cancelPending();
    const timer = setTimeout(() => {
      this.pending = undefined;
      this.save(value()).then(
        () => onResult(null),
        (error: unknown) => onResult(error),
      );
    }, delayMs);
    this.pending = { value, timer };
  }

  /** Writes a pending `saveSoon` straight away, e.g. when the page is being closed. */
  flush(): Promise<void> {
    const pending = this.pending;
    return pending ? this.save(pending.value()) : Promise.resolve();
  }

  private cancelPending(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = undefined;
    }
  }

  private async write(text: string): Promise<void> {
    if (this.primary.available) {
      try {
        await this.primary.write(text);
        await this.fallback.remove().catch(() => undefined);
        return;
      } catch (primaryError) {
        console.error(`Could not save ${this.schema.name} in IndexedDB; trying localStorage`, primaryError);
      }
    }
    try {
      await this.fallback.write(text);
    } catch (fallbackError) {
      throw new Error(`Could not save ${this.schema.name} in IndexedDB or localStorage`, { cause: fallbackError });
    }
  }
}

async function readSafely(store: TextStore): Promise<string | null> {
  if (!store.available) {
    return null;
  }
  try {
    return await store.read();
  } catch (error) {
    console.error('Could not read saved data', error);
    return null;
  }
}

function savedAt(value: unknown): number {
  const stamp = (value as Partial<Envelope> | null)?.savedAt;
  return typeof stamp === 'number' ? stamp : 0;
}
