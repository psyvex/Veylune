export interface ModelCache {
  get(key: string): Promise<ArrayBuffer | undefined>;
  put(key: string, bytes: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryModelCache implements ModelCache {
  private readonly entries = new Map<string, ArrayBuffer>();

  async get(key: string): Promise<ArrayBuffer | undefined> {
    const value = this.entries.get(key);
    return value?.slice(0);
  }

  async put(key: string, bytes: ArrayBuffer): Promise<void> {
    this.entries.set(key, bytes.slice(0));
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

export class IndexedDbModelCache implements ModelCache {
  private readonly dbName: string;
  private readonly storeName = "models";
  private dbPromise?: Promise<IDBDatabase>;

  constructor(dbName = "veylune-model-cache-v1") {
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open model cache."));
    });
    return this.dbPromise;
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly").objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined);
      request.onerror = () => reject(request.error ?? new Error("Unable to read model cache."));
    });
  }

  async put(key: string, bytes: ArrayBuffer): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).put(bytes, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to write model cache."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Model cache write aborted."));
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete model cache."));
    });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear model cache."));
    });
  }
}
