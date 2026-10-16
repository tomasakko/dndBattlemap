/** A single string record kept in IndexedDB, which (unlike localStorage) has room for large images. */
export class IndexedDbStore {
  constructor(
    private readonly databaseName: string,
    private readonly storeName = 'state',
    private readonly recordKey = 'current',
    private readonly version = 1,
  ) {}

  get available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async read(): Promise<string | null> {
    if (!this.available) {
      return null;
    }
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readonly');
      const request = transaction.objectStore(this.storeName).get(this.recordKey);
      transaction.oncomplete = () => {
        database.close();
        resolve(typeof request.result === 'string' ? request.result : null);
      };
      transaction.onerror = transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('Could not read ' + this.databaseName));
      };
    });
  }

  async write(value: string): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      transaction.objectStore(this.storeName).put(value, this.recordKey);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('Could not save ' + this.databaseName));
      };
    });
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, this.version);
      request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open ' + this.databaseName));
    });
  }
}

/** Runs saves one after another so an older save can never overwrite a newer one. */
export class SaveQueue {
  private tail: Promise<void> = Promise.resolve();

  /** Resolves once the save has finished; failures go to `onError` instead of rejecting. */
  enqueue(save: () => Promise<void>, onSuccess: () => void, onError: (error: unknown) => void): Promise<void> {
    this.tail = this.tail.then(save).then(onSuccess).catch(onError);
    return this.tail;
  }
}
