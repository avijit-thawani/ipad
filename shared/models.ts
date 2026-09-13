/**
 * The model catalog: which models exist, what each costs and measures, and
 * which parameters each actually accepts.
 *
 * Prompt text lives in ./prompts.ts, not here.
 *
 * Shared by the UI and by `netlify/functions/generate.ts`, which validates
 * every incoming choice against it — a picker in the browser is a suggestion,
 * not a constraint, and this endpoint spends money.
 *
 * All figures verified against GET /api/v1/images/models and
 * /api/v1/images/models/{id}/endpoints, Sept 2026. Re-check after any release:
 * slugs and parameter enums change without notice.
 */

/**
 * Only two parameters are near-universal across the 52 image-input models:
 * `aspect_ratio` (51) and `input_references` (51). Everything else is a
 * minority, which is why "effort" cannot be one parameter — see EffortAxis.
 */
export type EffortAxis = 'quality' | 'resolution' | null;

export type ModelSpec = {
  id: string;
  label: string;
  /** What it is for, in one clause. */
  blurb: string;
  /**
   * Per-image cost. Billing units genuinely differ: some models charge a flat
   * price per image, some per megapixel, some per output token. Token-billed
   * entries assume roughly 1.1K output tokens for a 1K image, so treat them as
   * an estimate — the real number comes back in `usage.cost` on every call and
   * is what the UI displays after a render.
   */
  priceUsd: number;
  priceNote: string;
  /**
   * Which parameter the effort slider drives for this model, and the value at
   * each of the four stops. `null` means the model exposes neither, so the
   * slider is disabled rather than silently ignored.
   */
  effortAxis: EffortAxis;
  effortStops: string[];
  aspectRatios: string[];
  supportsSeed: boolean;
  /**
   * Netlify kills a synchronous function at 60s and `generate.ts` gives up at
   * 50s, so a slow model simply cannot work here. OpenRouter's own worked
   * example has `openai/gpt-image-2` at `quality: high` taking 94s and costing
   * $0.13 — four times the token-derived estimate. Models flagged here get a
   * warning in the UI once effort is raised past Normal.
   */
  slowAtHighEffort: boolean;
  /**
   * Measured, at lowest effort, by `tools/compare-models.ts` on one sketch —
   * so indicative rather than a benchmark, but real, which is more than
   * OpenRouter offers. Seconds for the whole round trip.
   *
   * The progress bar treats this as an **upper bound** rather than an average:
   * a render that arrives sooner just cuts the bar short, which is the common
   * case and needs no special handling.
   */
  measuredSeconds: number;
  /** Measured cost of that same call, in USD. */
  measuredUsd: number;
  /**
   * True when even the *lowest* effort blew the 50s budget, which makes the
   * model unusable from this app however you set the slider. No catalog entry
   * sets it today — Seedream 5 Pro measured 94.5s and was removed rather than
   * shipped as a trap — but it is kept as the guard for anything added later.
   */
  exceedsCap: boolean;
};

export const EFFORT_LABELS = ['Draft', 'Normal', 'High', 'Max'] as const;
export type EffortLevel = 0 | 1 | 2 | 3;

const GEMINI_ASPECTS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];
const OPENAI_ASPECTS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'];

export const MODELS: ModelSpec[] = [
  {
    id: 'google/gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    blurb: 'more resolution headroom than Lite, but Draft means a literal 512px',
    priceUsd: 0.067,
    priceNote: '$0.00006 per output token',
    effortAxis: 'resolution',
    effortStops: ['512', '1K', '2K', '4K'],
    aspectRatios: GEMINI_ASPECTS,
    supportsSeed: false,
    measuredSeconds: 8.8,
    measuredUsd: 0.0454,
    exceedsCap: false,
    slowAtHighEffort: false,
  },
  {
    id: 'google/gemini-3.1-flash-lite-image',
    label: 'Nano Banana 2 Lite',
    blurb: 'the default: fastest measured at 6.4s, and 1K regardless of effort',
    priceUsd: 0.034,
    priceNote: '$0.00003 per output token',
    effortAxis: null,
    effortStops: [],
    aspectRatios: GEMINI_ASPECTS,
    supportsSeed: false,
    measuredSeconds: 6.4,
    measuredUsd: 0.0339,
    exceedsCap: false,
    slowAtHighEffort: false,
  },
  {
    id: 'google/gemini-3-pro-image',
    label: 'Nano Banana Pro',
    blurb: 'the slow, careful one; charges for the sketch as well as the render',
    priceUsd: 0.134,
    priceNote: 'billed per input and output token',
    effortAxis: 'resolution',
    effortStops: ['1K', '1K', '2K', '4K'],
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    supportsSeed: false,
    measuredSeconds: 23.5,
    measuredUsd: 0.1357,
    exceedsCap: false,
    slowAtHighEffort: false,
  },
  {
    id: 'openai/gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    blurb: 'precision tier; the only family with a real quality dial',
    priceUsd: 0.13,
    priceNote: '$0.13 at high quality per OpenRouter docs; scales steeply with effort',
    effortAxis: 'quality',
    effortStops: ['low', 'medium', 'high', 'max'],
    aspectRatios: OPENAI_ASPECTS,
    supportsSeed: false,
    measuredSeconds: 19.6,
    measuredUsd: 0.0185,
    exceedsCap: false,
    slowAtHighEffort: true,
  },
  {
    id: 'openai/gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    blurb: 'the expressive sibling of Sunburst, same controls',
    priceUsd: 0.13,
    priceNote: '$0.13 at high quality per OpenRouter docs; scales steeply with effort',
    effortAxis: 'quality',
    effortStops: ['low', 'medium', 'high', 'max'],
    aspectRatios: OPENAI_ASPECTS,
    supportsSeed: false,
    measuredSeconds: 14.1,
    measuredUsd: 0.0185,
    exceedsCap: false,
    slowAtHighEffort: true,
  },
  {
    id: 'openai/gpt-image-2',
    label: 'GPT Image 2',
    blurb: 'previous generation; caps out at high',
    priceUsd: 0.13,
    priceNote: '$0.13 at high quality per OpenRouter docs; scales steeply with effort',
    effortAxis: 'quality',
    effortStops: ['low', 'medium', 'high', 'high'],
    aspectRatios: OPENAI_ASPECTS,
    supportsSeed: false,
    measuredSeconds: 14.4,
    measuredUsd: 0.0184,
    exceedsCap: false,
    slowAtHighEffort: true,
  },
  {
    id: 'black-forest-labs/flux.2-pro',
    label: 'FLUX.2 Pro',
    blurb: 'billed per megapixel; no effort dial, but takes a seed',
    priceUsd: 0.031,
    priceNote: '$0.03 per megapixel',
    effortAxis: null,
    effortStops: [],
    aspectRatios: OPENAI_ASPECTS,
    supportsSeed: true,
    measuredSeconds: 14.0,
    measuredUsd: 0.06,
    exceedsCap: false,
    slowAtHighEffort: false,
  },
];

export const DEFAULT_MODEL_ID = 'google/gemini-3.1-flash-lite-image';

export function findModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Pick the supported aspect ratio closest to the canvas, comparing on the
 * logarithm of the ratio so that 2:1 and 1:2 are treated as equally far from
 * 1:1. This is what keeps the render the same shape as what you drew.
 */
export function nearestAspect(model: ModelSpec, width: number, height: number): string {
  if (!width || !height) return '1:1';
  const target = Math.log(width / height);

  let best = '1:1';
  let bestDistance = Infinity;
  for (const ratio of model.aspectRatios) {
    if (ratio === 'auto') continue;
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) continue;
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = ratio;
    }
  }
  return best;
}

/** The model-specific parameter the effort slider maps to, if any. */
export function effortParams(model: ModelSpec, level: EffortLevel): Record<string, string> {
  if (!model.effortAxis || !model.effortStops.length) return {};
  const value = model.effortStops[Math.min(level, model.effortStops.length - 1)];
  return { [model.effortAxis]: value };
}
