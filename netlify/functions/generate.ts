import { json, requireAuth } from '../lib/auth';

const DEFAULT_MODEL = 'google/gemini-3.1-flash-image';

/**
 * Netlify kills a synchronous function at 60s. Bailing at 50 leaves room to
 * return a real error message instead of an opaque 502.
 */
const UPSTREAM_TIMEOUT_MS = 50_000;

/** Netlify caps a buffered request at 6 MB; stop well short of it. */
const MAX_SKETCH_BYTES = 4 * 1024 * 1024;

/**
 * The model is handed a rough pencil drawing, not a photo. Without being told
 * so it tends to reproduce the wobbly lines faithfully — cleaning up the
 * sketch rather than realising it. Saying what the input *is* is what turns
 * this from image-editing into sketch-to-image.
 */
const PREAMBLE =
  'The reference image is a rough hand-drawn sketch. Treat it as a layout and ' +
  'composition guide: keep the arrangement, proportions and placement of what ' +
  'is drawn, but render it as a finished image rather than copying the pencil ' +
  'strokes. Ignore stray marks.';

const FALLBACK_PROMPT =
  'Render the sketch as a detailed, well-lit illustration, choosing a style ' +
  'that suits the subject.';

/**
 * Write the sketch, the render and the exact prompt to `renders/` when
 * DEBUG_SAVE_RENDERS is set. The browser keeps only 320px thumbnails, so
 * without this there is no way to compare what a prompt change actually did to
 * the output. Local dev only: Netlify's filesystem is read-only apart from
 * /tmp, so a failure here is ignored rather than allowed to lose a paid render.
 */
async function saveForDebugging(sketch: string, b64: string, prompt: string): Promise<void> {
  if (!process.env.DEBUG_SAVE_RENDERS) return;
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = 'renders';
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${dir}/${stamp}`;
    const sketchB64 = sketch.slice(sketch.indexOf(',') + 1);
    await writeFile(`${base}-sketch.png`, Buffer.from(sketchB64, 'base64'));
    await writeFile(`${base}-render.png`, Buffer.from(b64, 'base64'));
    await writeFile(`${base}-prompt.txt`, prompt);
  } catch {
    // Never fail a generation over a debug artefact.
  }
}

export default async (request: Request): Promise<Response> => {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: 'OPENROUTER_API_KEY is not set' }, 500);

  let sketch: unknown;
  let prompt: unknown;
  try {
    const body = (await request.json()) as { sketch?: unknown; prompt?: unknown };
    sketch = body.sketch;
    prompt = body.prompt;
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  if (typeof sketch !== 'string' || !sketch.startsWith('data:image/')) {
    return json({ error: 'sketch must be an image data URL' }, 400);
  }
  if (sketch.length > MAX_SKETCH_BYTES) {
    return json({ error: 'sketch is too large' }, 413);
  }

  const asked = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : FALLBACK_PROMPT;
  const model = process.env.IMAGE_MODEL || DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Surfaces the app on OpenRouter's dashboard and rankings.
        'HTTP-Referer': 'https://avi-sketch.netlify.app',
        'X-Title': 'Sketch',
      },
      body: JSON.stringify({
        model,
        prompt: `${PREAMBLE}\n\n${asked}`,
        input_references: [{ type: 'image_url', image_url: { url: sketch } }],
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    return json({ error: timedOut ? 'the model took too long' : 'could not reach OpenRouter' }, 504);
  }

  if (!response.ok) {
    // Pass the upstream detail through. A bad model slug or an exhausted
    // credit balance both land here, and they need different fixes.
    const detail = await response.text();
    return json({ error: `OpenRouter ${response.status}: ${detail.slice(0, 300)}` }, 502);
  }

  const result = (await response.json()) as {
    data?: { b64_json?: string; media_type?: string }[];
    usage?: { cost?: number };
  };

  const image = result.data?.[0];
  if (!image?.b64_json) {
    return json({ error: 'the model returned no image' }, 502);
  }

  await saveForDebugging(sketch, image.b64_json, asked);

  return json({
    image: `data:${image.media_type ?? 'image/png'};base64,${image.b64_json}`,
    model,
    cost: typeof result.usage?.cost === 'number' ? result.usage.cost : null,
  });
};
