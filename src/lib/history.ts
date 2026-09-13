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

export type Turn = {
  id: string;
  prompt: string;
  model: string;
  at: string;
  sketchThumb: string;
  resultThumb: string;
};

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
