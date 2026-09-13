/**
 * The session log of rounds: what you drew, what you asked for, what came back.
 *
 * Full-resolution PNGs are roughly a megabyte of base64 each, and localStorage
 * gives you about five megabytes total, so persisting two per round would blow
 * the quota on the third sketch. Only downscaled thumbnails are stored; the
 * full-size render lives in memory for as long as the tab does, which is what
 * the Download button hands you. A reload leaves you with the strip, not the
 * originals.
 */
const TURNS_KEY = 'ipad.turns';
const MAX_TURNS = 24;
const THUMB_PX = 320;

/**
 * `crypto.randomUUID` exists only in a secure context, and dev over the LAN is
 * plain HTTP, so on the iPad it is undefined — which threw *after* the render
 * had been displayed and before it could be recorded, losing the round.
 * `getRandomValues` has no such restriction, and this id only has to be unique
 * within one browser's history.
 */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type Turn = {
  id: string;
  prompt: string;
  model: string;
  style: string;
  effort: number;
  aspect: string;
  /** Measured, not advertised. OpenRouter publishes no latency for images. */
  elapsedMs: number;
  costUsd: number | null;
  at: string;
  sketchThumb: string;
  resultThumb: string;
};

/**
 * What a model has actually cost and how long it has actually taken, averaged
 * over this browser's history. The catalog's figures are estimates derived
 * from per-token pricing; these are the real ones.
 */
export type Observed = { runs: number; meanMs: number; meanCost: number | null };

export function observe(turns: Turn[], modelId: string): Observed | null {
  const mine = turns.filter((t) => t.model === modelId);
  if (!mine.length) return null;

  const costs = mine.map((t) => t.costUsd).filter((c): c is number => typeof c === 'number');
  return {
    runs: mine.length,
    meanMs: Math.round(mine.reduce((sum, t) => sum + (t.elapsedMs || 0), 0) / mine.length),
    meanCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
  };
}

/**
 * Draw a data URL into a canvas no bigger than THUMB_PX on its long edge and
 * re-encode as JPEG. PNG thumbnails of line art barely compress, and the whole
 * point here is to fit the strip into the storage budget.
 */
export async function thumbnail(dataUrl: string): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const scale = Math.min(1, THUMB_PX / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  // Sketches export with a transparent background, which JPEG renders black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Build a turn record, so callers never have to think about id generation. */
export async function makeTurn(
  fields: Omit<Turn, 'id' | 'at' | 'sketchThumb' | 'resultThumb'> & {
    sketch: string;
    result: string;
  }
): Promise<Turn> {
  const { sketch, result, ...rest } = fields;
  return {
    ...rest,
    id: newId(),
    at: new Date().toISOString(),
    sketchThumb: await thumbnail(sketch),
    resultThumb: await thumbnail(result),
  };
}

export function loadTurns(): Turn[] {
  try {
    const raw = localStorage.getItem(TURNS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt log is not worth failing to start over.
    return [];
  }
}

/** Newest first, capped, and tolerant of a full quota. */
export function saveTurns(turns: Turn[]): Turn[] {
  const capped = turns.slice(0, MAX_TURNS);
  for (let attempt = capped.length; attempt > 0; attempt--) {
    try {
      localStorage.setItem(TURNS_KEY, JSON.stringify(capped.slice(0, attempt)));
      return capped.slice(0, attempt);
    } catch {
      // Quota exceeded despite the thumbnails: drop the oldest and retry.
    }
  }
  localStorage.removeItem(TURNS_KEY);
  return [];
}

export function clearTurns(): void {
  localStorage.removeItem(TURNS_KEY);
}
