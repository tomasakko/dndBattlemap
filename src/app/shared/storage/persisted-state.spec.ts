import { PersistedState, Schema, TextStore, fromSaved, toEnvelope } from './persisted-state';

interface Counter {
  count: number;
}

/** Version 0 saved `{ n }`; version 1 saves `{ count }`. */
const schema: Schema<Counter> = {
  name: 'counter',
  version: 1,
  migrate: (data) => ({ count: (data as { n: number }).n }),
  validate: (data) => {
    const value = data as Partial<Counter> | null;
    if (!value || typeof value.count !== 'number') {
      throw new Error('Invalid counter');
    }
    return { count: value.count };
  },
};

class MemoryText implements TextStore {
  value: string | null = null;
  failWrites = false;
  constructor(public available = true) {}
  async read(): Promise<string | null> {
    return this.value;
  }
  async write(value: string): Promise<void> {
    if (this.failWrites) {
      throw new Error('full');
    }
    this.value = value;
  }
  async remove(): Promise<void> {
    this.value = null;
  }
}

describe('fromSaved', () => {
  it('reads the current version', () => {
    expect(fromSaved(schema, toEnvelope(schema, { count: 3 }))).toEqual({ count: 3 });
  });

  it('migrates bare data from before versioning', () => {
    expect(fromSaved(schema, { n: 5 })).toEqual({ count: 5 });
  });

  it('refuses data from a newer version', () => {
    expect(() => fromSaved(schema, { schema: 'counter', version: 2, savedAt: 0, data: {} })).toThrow();
  });

  it('rejects invalid data', () => {
    expect(() => fromSaved(schema, toEnvelope(schema, { count: 'x' } as unknown as Counter))).toThrow();
  });
});

describe('PersistedState', () => {
  let primary: MemoryText;
  let fallback: MemoryText;
  let state: PersistedState<Counter>;

  beforeEach(() => {
    primary = new MemoryText();
    fallback = new MemoryText();
    state = new PersistedState(schema, primary, fallback);
  });

  it('saves to the primary store and loads it back', async () => {
    await state.save({ count: 1 });
    expect(fallback.value).toBeNull();
    expect(await state.load()).toEqual({ count: 1 });
  });

  it('falls back when the primary store fails, and still loads', async () => {
    primary.failWrites = true;
    await state.save({ count: 2 });
    expect(fallback.value).not.toBeNull();
    expect(await state.load()).toEqual({ count: 2 });
  });

  it('rejects when neither store accepts the save', async () => {
    primary.failWrites = true;
    fallback.failWrites = true;
    await expect(state.save({ count: 3 })).rejects.toThrow();
  });

  it('prefers the newest copy when both stores hold one', async () => {
    primary.value = JSON.stringify(toEnvelope(schema, { count: 1 }, 100));
    fallback.value = JSON.stringify(toEnvelope(schema, { count: 2 }, 200));
    expect(await state.load()).toEqual({ count: 2 });
  });

  it('moves an old localStorage copy into the primary store', async () => {
    fallback.value = JSON.stringify({ n: 7 });
    expect(await state.load()).toEqual({ count: 7 });
    expect(JSON.parse(primary.value!).data).toEqual({ count: 7 });
    expect(fallback.value).toBeNull();
  });

  it('returns null when nothing was saved', async () => {
    expect(await state.load()).toBeNull();
  });
});
