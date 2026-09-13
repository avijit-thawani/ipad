/**
 * The session transcript: every round, in IndexedDB.
 *
 * This used to be 320px thumbnails in localStorage, because a megabyte of
 * base64 per round blows the ~5MB quota by the third sketch. That was fine
 * while history was only ever *looked* at. Now it can be sent back to the
 * model, so each round has to keep an image good enough to be a reference, and
 * localStorage cannot hold those. IndexedDB has no such limit.
 *
 * Three sizes per image, each earning its keep:
 *
 * - `full`  the render at native size, for Save. Only the render needs this;
 *           the sketch's authoritative copy is tldraw's own document.
 * - `ref`   ~768px JPEG, what gets sent as context. Netlify caps a buffered
 *           request at 6MB, so sending full-size history would blow the
 *           payload after three or four rounds.
 * - `thumb` ~320px JPEG, for the transcript.
 */
const DB_NAME = 'ipad-sketch-history';
const DB_VERSION = 1;
const STORE = 'turns';

const REF_PX = 768;
const THUMB_PX = 320;

export type Turn = {
  id: string;
  at: string;
  /** Style id and adherence level: shown in the transcript. */
  style: string;
  adherence: number;
  /** Kept for the log and for debugging, deliberately not shown. */
  model: string;
  effort: number;
  aspect: string;
  elapsedMs: number;
  costUsd: number | null;
  prompt: string;
  sketchRef: string;
  sketchThumb: string;
  renderFull: string;
  renderRef: string;
  renderThumb: string;
  /**
   * Hidden messages stay in the transcript but are excluded from the next
   * request. Separate flags because the sketch and the render are separate
   * messages and you may want the render's look without the sketch's layout.
   */
  sketchHidden: boolean;
  renderHidden: boolean;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * `crypto.randomUUID` exists only in a secure context, and dev over the LAN is
 * plain HTTP, so on the iPad it is undefined. `getRandomValues` has no such
 * restriction, and this id only has to be unique within one browser.
 */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Downscale to at most `maxPx` on the long edge and re-encode as JPEG. PNG
 * line art barely compresses, and the whole point is to fit a payload budget.
 */
async function resize(dataUrl: string, maxPx: number, quality: number): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const scale = Math.min(1, maxPx / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  // Sketches export with a transparent background, which JPEG renders black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function makeTurn(fields: {
  style: string;
  adherence: number;
  model: string;
  effort: number;
  aspect: string;
  elapsedMs: number;
  costUsd: number | null;
  prompt: string;
  sketch: string;
  render: string;
}): Promise<Turn> {
  const { sketch, render, ...rest } = fields;
  const [sketchRef, sketchThumb, renderRef, renderThumb] = await Promise.all([
    resize(sketch, REF_PX, 0.82),
    resize(sketch, THUMB_PX, 0.7),
    resize(render, REF_PX, 0.82),
    resize(render, THUMB_PX, 0.7),
  ]);

  return {
    ...rest,
    id: newId(),
    at: new Date().toISOString(),
    sketchRef,
    sketchThumb,
    renderFull: render,
    renderRef,
    renderThumb,
    sketchHidden: false,
    renderHidden: false,
  };
}

/** Oldest first, which is the order a transcript reads in. */
export async function loadTurns(): Promise<Turn[]> {
  try {
    const db = await open();
    const all = await new Promise<Turn[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as Turn[]) ?? []);
      request.onerror = () => reject(request.error);
    });
    return all.sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    // A corrupt or blocked store is not worth failing to start over.
    return [];
  }
}

export async function putTurn(turn: Turn): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(turn);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // The render is already on screen; losing the record must not lose it.
  }
}

export async function clearTurns(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
  } catch {
    // Nothing to clear.
  }
}

/**
 * The reference images to send, oldest first, excluding anything hidden and
 * trimmed to fit the model's cap.
 *
 * `budget` is the model's `maxReferences` minus one, since the current sketch
 * takes a slot. When there is more history than budget the *newest* is kept:
 * recent rounds are what you are iterating on, and the oldest sketch is the
 * least likely to still matter.
 */
export function contextImages(turns: Turn[], budget: number): string[] {
  const ordered: string[] = [];
  for (const turn of turns) {
    if (!turn.sketchHidden) ordered.push(turn.sketchRef);
    if (!turn.renderHidden) ordered.push(turn.renderRef);
  }
  return budget <= 0 ? [] : ordered.slice(-budget);
}
