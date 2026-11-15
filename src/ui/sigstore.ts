/** Saved signatures, kept only in this browser (IndexedDB). Nothing is uploaded. Ported from Prism Scan. */
export interface SavedSig { id: string; png: Uint8Array; w: number; h: number; created: number }

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('pagedock', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('sigs')) r.result.createObjectStore('sigs', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('sigs', mode);
    const req = fn(t.objectStore('sigs'));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = t.onabort = () => rej(t.error ?? new Error('Storage error'));
  });
}

export async function listSigs(): Promise<SavedSig[]> {
  try { return ((await run('readonly', (s) => s.getAll())) as SavedSig[] ?? []).sort((a, b) => b.created - a.created); }
  catch { return []; } // private mode or storage blocked: signatures simply are not remembered
}
export async function saveSig(sig: Omit<SavedSig, 'id' | 'created'>): Promise<SavedSig> {
  const rec: SavedSig = { ...sig, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), created: Date.now() };
  try { await run('readwrite', (s) => s.put(rec)); } catch { /* not remembered, still usable now */ }
  return rec;
}
export async function deleteSig(id: string): Promise<void> {
  try { await run('readwrite', (s) => s.delete(id)); } catch { /* ignore */ }
}
