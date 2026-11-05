/**
 * A small setting kept in localStorage (sidebar state, theme, open tabs, …).
 * Reading falls back to `fallback` when storage is unavailable (SSR, private mode) or the value is invalid,
 * and writing silently does nothing then: the setting just won't survive a reload.
 */
export interface LocalPref<T> {
  read(): T;
  write(value: T): void;
}

export interface LocalPrefOptions<T> {
  /** Turns the stored text into a value; return `undefined` when it isn't valid. Defaults to JSON. */
  parse?: (raw: string) => T | undefined;
  /** Turns a value into stored text. Defaults to JSON. */
  serialise?: (value: T) => string;
}

export function localPref<T>(key: string, fallback: T, options: LocalPrefOptions<T> = {}): LocalPref<T> {
  const parse = options.parse ?? ((raw: string) => JSON.parse(raw) as T);
  const serialise = options.serialise ?? ((value: T) => JSON.stringify(value));
  return {
    read(): T {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        if (raw === null || raw === undefined) {
          return fallback;
        }
        const value = parse(raw);
        return value === undefined ? fallback : value;
      } catch {
        return fallback;
      }
    },
    write(value: T): void {
      try {
        globalThis.localStorage?.setItem(key, serialise(value));
      } catch {
        // Storage is full or blocked; the setting just won't survive a reload.
      }
    },
  };
}

/** A true/false setting stored as the text "true" or "false". */
export function booleanPref(key: string, fallback: boolean): LocalPref<boolean> {
  return localPref(key, fallback, {
    parse: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
    serialise: String,
  });
}

/** A text setting stored as-is, optionally limited to known values. */
export function stringPref(key: string, fallback: string, allowed?: readonly string[]): LocalPref<string> {
  return localPref(key, fallback, {
    parse: (raw) => (raw && (!allowed || allowed.includes(raw)) ? raw : undefined),
    serialise: (value) => value,
  });
}
