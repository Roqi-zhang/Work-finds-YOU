// Small IndexedDB wrapper so a picked resume / JD file survives a page switch
// or the login round-trip — the user should never be asked to re-upload.

const DB = "wfy-files";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve) => {
      const store = db.transaction(STORE, mode).objectStore(STORE);
      const req = run(store);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveFile(key: string, file: File) {
  await tx("readwrite", (s) => s.put(file, key) as unknown as IDBRequest<unknown>);
}

export async function loadFile(key: string): Promise<File | null> {
  const v = await tx<File>("readonly", (s) => s.get(key) as IDBRequest<File>);
  return v instanceof File ? v : null;
}

export async function dropFile(key: string) {
  await tx("readwrite", (s) => s.delete(key) as unknown as IDBRequest<unknown>);
}
