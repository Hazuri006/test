export interface SaveRecord<T> {
  slot: string;
  version: number;
  timestamp: number;
  data: T;
}

export interface SaveMeta {
  slot: string;
  version: number;
  timestamp: number;
}

const DB_NAME = 'driftwake';
const STORE = 'saves';

/**
 * IndexedDB-backed save system with named slots, version migration,
 * corruption detection and JSON export/import.
 */
export class SaveManager<T> {
  constructor(
    private readonly version: number,
    private readonly migrate: (data: unknown, fromVersion: number) => T | null = (d) => d as T,
  ) {}

  private available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'slot' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async list(): Promise<SaveMeta[]> {
    if (!this.available()) return [];
    const db = await this.open();
    try {
      return await new Promise<SaveMeta[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
          const records = req.result as SaveRecord<T>[];
          resolve(
            records
              .map((r) => ({ slot: r.slot, version: r.version, timestamp: r.timestamp }))
              .sort((a, b) => b.timestamp - a.timestamp),
          );
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async save(slot: string, data: T): Promise<void> {
    if (!this.available()) throw new Error('IndexedDB indisponible');
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const record: SaveRecord<T> = {
          slot,
          version: this.version,
          timestamp: Date.now(),
          data,
        };
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async load(slot: string): Promise<T | null> {
    if (!this.available()) return null;
    const db = await this.open();
    try {
      const record = await new Promise<SaveRecord<T> | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(slot);
        req.onsuccess = () => resolve(req.result as SaveRecord<T> | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!record) return null;
      if (record.version !== this.version) {
        return this.migrate(record.data, record.version);
      }
      return record.data;
    } catch {
      return null; // corrupted / unreadable
    } finally {
      db.close();
    }
  }

  async delete(slot: string): Promise<void> {
    if (!this.available()) return;
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(slot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async exportJSON(slot: string): Promise<string | null> {
    const data = await this.load(slot);
    if (data === null) return null;
    return JSON.stringify({ slot, version: this.version, data }, null, 2);
  }

  async importJSON(json: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(json) as { slot?: string; data?: T };
      if (!parsed.slot || parsed.data === undefined) return false;
      await this.save(parsed.slot, parsed.data);
      return true;
    } catch {
      return false;
    }
  }
}
