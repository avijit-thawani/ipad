import { EFFORT_LABELS, MODELS, type EffortLevel, type ModelSpec } from '../../shared/models';
import { ADHERENCE, STYLES, findAdherence, findStyle } from '../../shared/prompts';

/**
 * The four control axes, which are orthogonal in the interface but not in the
 * request:
 *
 * - **Style** is pure text appended to the prompt, so every model takes it.
 * - **Sketch** is the same trick: one of five hand-written adherence clauses,
 *   from Interpret to Literal. No image model exposes a parameter for this,
 *   and the reference image is all-or-nothing, so prompt text is the only
 *   lever there is. The wording lives in shared/prompts.ts.
 * - **Model** is the slug.
 * - **Effort** is the leaky one. There is no reasoning-effort concept for image
 *   models; the nearest equivalents are `quality` (only 9 of 52 models) and
 *   `resolution` (19), which are different parameters with different values.
 *   The slider is one control whose stops map to whichever the chosen model
 *   exposes, and it disables itself for models that expose neither rather than
 *   pretending to do something.
 *
 * Returns a fragment, not a row: it shares one line with the Generate button
 * in DrawPage, because three stacked rows of controls was most of the screen.
 *
 * Every option carries a leading emoji so that a collapsed select says which
 * control it is as well as its value — "🎨 Free" and "✒️ Medium" than
 * "Free" and "Medium", which told you nothing on their own.
 *
 * Per-run timings and costs are deliberately absent; they go to
 * `renders/log.jsonl`, which survives a restart.
 */
const select =
  'rounded-field bg-base-100 border-2 border-base-content/15 px-2 py-1 text-xs ' +
  'focus:border-primary/60 focus:outline-none';

export default function Settings({
  model,
  onModel,
  style,
  onStyle,
  effort,
  onEffort,
  adherence,
  onAdherence,
  aspect,
}: {
  model: ModelSpec;
  onModel: (id: string) => void;
  style: string;
  onStyle: (id: string) => void;
  effort: EffortLevel;
  onEffort: (level: EffortLevel) => void;
  adherence: number;
  onAdherence: (level: number) => void;
  aspect: string;
}) {
  return (
    <>
      <select
        value={style}
        onChange={(e) => onStyle(e.target.value)}
        aria-label="Render style"
        title={findStyle(style)?.clause || 'No style clause; describe it yourself'}
        className={select}
      >
        {STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            🎨 {s.label}
          </option>
        ))}
      </select>

      {/* Truncated rather than shown in full: the price and time matter when
          choosing, and take too much width to keep on display afterwards. */}
      <select
        value={model.id}
        onChange={(e) => onModel(e.target.value)}
        aria-label="Model"
        className={`${select} max-w-40`}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            🤖 {m.label} · ${m.measuredUsd.toFixed(3)} · {m.measuredSeconds}s
          </option>
        ))}
      </select>

      {/* One flex item each, so a label, slider and readout can never be split
          across a wrap or collide with the control beside them. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-xs ${model.effortAxis ? '' : 'opacity-30'}`} title="Effort">
          ⚙️
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={effort}
          disabled={!model.effortAxis}
          onChange={(e) => onEffort(Number(e.target.value) as EffortLevel)}
          className="range range-xs w-20 disabled:opacity-30"
        />
        <span className="text-xs text-base-content/50 w-20">
          {model.effortAxis ? `${EFFORT_LABELS[effort]} ${model.effortStops[effort]}` : 'fixed'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs" title="How literally to follow the sketch">
          ✏️
        </span>
        <input
          type="range"
          min={ADHERENCE[0].level}
          max={ADHERENCE[ADHERENCE.length - 1].level}
          step={1}
          value={adherence}
          onChange={(e) => onAdherence(Number(e.target.value))}
          className="range range-xs w-20"
          title={findAdherence(adherence)?.clause}
        />
        <span className="text-xs text-base-content/50 w-16">
          {findAdherence(adherence)?.label}
        </span>
      </div>

      {/* Derived from the canvas, so the render is the same shape as what you
          drew. Shown rather than chosen. */}
      <span className="text-xs text-base-content/40" title="Output aspect ratio">
        {aspect}
      </span>

      {model.slowAtHighEffort && effort >= 2 && (
        <span className="text-xs text-warning" title={model.priceNote}>
          may exceed 50s
        </span>
      )}
    </>
  );
}
