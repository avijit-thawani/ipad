import { json, requireAuth } from '../lib/auth';
import { DEFAULT_MODEL_ID, effortParams, findModel, type EffortLevel } from '../../shared/models';
import {
  DEFAULT_ADHERENCE,
  buildPrompt,
  findAdherence,
  findStyle,
} from '../../shared/prompts';

/**
 * Netlify kills a synchronous function at 60s. Bailing at 50 leaves room to
 * return a real error message instead of an opaque 502.
 */
const UPSTREAM_TIMEOUT_MS = 50_000;

/** Netlify caps a buffered request at 6 MB; stop well short of it. */
const MAX_SKETCH_BYTES = 4 * 1024 * 1024;

/**
 * Write the sketch, the render and the exact prompt to `renders/` when
 * DEBUG_SAVE_RENDERS is set. The browser keeps only 320px thumbnails, so
 * without this there is no way to compare what a prompt change actually did to
 * the output. Local dev only: Netlify's filesystem is read-only apart from
 * /tmp, so a failure here is ignored rather than allowed to lose a paid render.
 */
async function saveForDebugging(
  sketch: string,
  b64: string,
  prompt: string,
  stats: Record<string, unknown>
): Promise<void> {
  if (!process.env.DEBUG_SAVE_RENDERS) return;
  try {
    const { mkdir, writeFile, appendFile } = await import('node:fs/promises');
    const dir = 'renders';
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${dir}/${stamp}`;
    const sketchB64 = sketch.slice(sketch.indexOf(',') + 1);
    await writeFile(`${base}-sketch.png`, Buffer.from(sketchB64, 'base64'));
    await writeFile(`${base}-render.png`, Buffer.from(b64, 'base64'));
    await writeFile(`${base}-prompt.txt`, prompt);

    // Appended, one JSON object per line, so the record of what each model
    // cost and how long it took outlives any number of server restarts — the
    // app deliberately shows none of this.
    await appendFile(`${dir}/log.jsonl`, `${JSON.stringify({ at: stamp, ...stats })}\n`);
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

  let body: {
    sketch?: unknown;
    prompt?: unknown;
    model?: unknown;
    style?: unknown;
    effort?: unknown;
    aspect?: unknown;
    adherence?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const { sketch } = body;
  if (typeof sketch !== 'string' || !sketch.startsWith('data:image/')) {
    return json({ error: 'sketch must be an image data URL' }, 400);
  }
  if (sketch.length > MAX_SKETCH_BYTES) {
    return json({ error: 'sketch is too large' }, 413);
  }

  // Every choice is re-checked here. The picker in the browser is a
  // suggestion; this endpoint is what actually spends money, so an unknown
  // model slug or a made-up quality value must not reach OpenRouter.
  const requested = typeof body.model === 'string' ? body.model : '';
  const envDefault = process.env.IMAGE_MODEL || DEFAULT_MODEL_ID;
  const model = findModel(requested) ?? findModel(envDefault) ?? findModel(DEFAULT_MODEL_ID);
  if (!model) return json({ error: 'no usable model configured' }, 500);
  if (requested && !findModel(requested)) {
    return json({ error: `unknown model: ${requested.slice(0, 80)}` }, 400);
  }

  const style = findStyle(typeof body.style === 'string' ? body.style : 'none');
  if (!style) return json({ error: 'unknown style' }, 400);

  const rawEffort = typeof body.effort === 'number' ? body.effort : 1;
  if (!Number.isInteger(rawEffort) || rawEffort < 0 || rawEffort > 3) {
    return json({ error: 'effort must be an integer from 0 to 3' }, 400);
  }
  const effort = rawEffort as EffortLevel;

  const aspect = typeof body.aspect === 'string' ? body.aspect : '';
  if (aspect && !model.aspectRatios.includes(aspect)) {
    return json({ error: `${model.id} does not support aspect ${aspect.slice(0, 20)}` }, 400);
  }

  const adherence = findAdherence(
    typeof body.adherence === 'number' ? body.adherence : DEFAULT_ADHERENCE
  );
  if (!adherence) return json({ error: 'adherence must be a level from 1 to 5' }, 400);

  // Assembled in one place, so this function never decides any wording.
  const prompt = buildPrompt({
    adherence,
    style,
    typed: typeof body.prompt === 'string' ? body.prompt : '',
  });

  const startedAt = Date.now();
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
        model: model.id,
        prompt,
        input_references: [{ type: 'image_url', image_url: { url: sketch } }],
        ...(aspect ? { aspect_ratio: aspect } : {}),
        ...effortParams(model, effort),
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

  const cost = typeof result.usage?.cost === 'number' ? result.usage.cost : null;
  const seconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));

  await saveForDebugging(sketch, image.b64_json, prompt, {
    model: model.id,
    seconds,
    cost,
    effort,
    effortParam: effortParams(model, effort),
    style: style.id,
    adherence: adherence.level,
    adherenceLabel: adherence.label,
    aspect,
    mediaType: image.media_type ?? null,
  });

  return json({
    image: `data:${image.media_type ?? 'image/png'};base64,${image.b64_json}`,
    model: model.id,
    cost,
  });
};
