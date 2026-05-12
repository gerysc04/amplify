/**
 * IndexedDB cache for binary files (.nam models and .wav cab IRs).
 * Files are stored by filename as key.
 */

const DB_NAME    = 'amplify-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

interface StoredFile { name: string; type: string; data: ArrayBuffer }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export const fileCache = {
  async store(file: File): Promise<void> {
    const db  = await openDB();
    const buf = await file.arrayBuffer();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ name: file.name, type: file.type, data: buf }, file.name);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  },

  async load(filename: string): Promise<File | null> {
    const db  = await openDB();
    const rec = await new Promise<StoredFile | undefined>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(filename);
      req.onsuccess = () => resolve(req.result as StoredFile | undefined);
      req.onerror   = () => reject(req.error);
    });
    db.close();
    if (!rec) return null;
    return new File([rec.data], rec.name, { type: rec.type });
  },

  async remove(filename: string): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  },

  async listKeys(): Promise<string[]> {
    const db   = await openDB();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    db.close();
    return keys as string[];
  },
};
