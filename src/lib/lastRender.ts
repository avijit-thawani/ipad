/**
 * The most recent render at full resolution, kept across reloads.
 *
 * tldraw already persists the sketch to IndexedDB via `persistenceKey`, so
 * before this the sketch survived a reload and the render did not — which
 * looked like the render had been thrown away. It had: the session strip only
 * holds 320px JPEG thumbnails, because a megabyte of base64 per round does not
 * fit in localStorage's ~5MB.
 *
 * IndexedDB has no such limit, so exactly one entry is kept here, holding the
 * render at full size. One rather than all of them: the strip covers browsing
 * history, and this only has to answer "what was I just looking at".
 */
const DB_NAME = 'ipad-sketch';
const STORE = 'last-render';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type LastRender = { image: string; model: string; at: string };

/** Never throws: a missing cache is not worth failing to start over. */
export async function loadLastRender(): Promise<LastRender | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as LastRender) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function saveLastRender(value: LastRender): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Caching is a convenience; losing it must not lose the render on screen.
  }
}

export async function clearLastRender(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
  } catch {
    // Nothing to clear.
  }
}
