import { EFFORT_LABELS, MODELS, type EffortLevel, type ModelSpec } from '../../shared/models';
import { ADHERENCE, STYLES, findAdherence, findStyle } from '../../shared/prompts';

/**
 * The four control axes, which are orthogonal in the interface but not in the
 * request:
 *
 * - **Style** is pure text appended to the prompt, so every model takes it.
 * - **Faithfulness** is the same trick: one of five hand-written adherence
 *   clauses, from Interpret to Literal. No image model exposes a parameter for
 *   this, and the reference image is all-or-nothing, so prompt text is the
 *   only lever there is. The wording lives in shared/prompts.ts.
 * - **Model** is the slug.
 * - **Effort** is the leaky one. There is no reasoning-effort concept for image
 *   models; the nearest equivalents are `quality` (only 9 of 52 models) and
 *   `resolution` (19), which are different parameters with different values.
 *   The slider maps onto whichever the chosen model exposes, and is replaced by
 *   a word for models exposing neither — a permanently greyed-out slider next
 *   to a live one just looked broken.
 *
 * Returns a fragment, not a row: it shares one line with the Generate button
 * in DrawPage, because three stacked rows of controls was most of the screen.
 *
 * Aspect ratio is not shown. It is derived from the canvas and cannot be
 * chosen, so displaying it only invited the question of how to change it.
 *
 * Per-run timings and costs are deliberately absent; they go to
 * `renders/log.jsonl`, which survives a restart.
 */
const select =
  'rounded-field bg-base-100 border-2 border-base-content/15 px-2 py-1 text-xs ' +
  'focus:border-primary/60 focus:outline-none';

const label = 'text-xs text-base-content/60';

export default function Settings({
  model,
  onModel,
  style,
  onStyle,
  effort,
  onEffort,
  adherence,
  onAdherence,
}: {
  model: ModelSpec;
  onModel: (id: string) => void;
  style: string;
  onStyle: (id: string) => void;
  effort: EffortLevel;
  onEffort: (level: EffortLevel) => void;
  adherence: number;
  onAdherence: (level: number) => void;
}) {
  return (
    <>
      <span className={label}>Style</span>
      <select
        value={style}
        onChange={(e) => onStyle(e.target.value)}
        aria-label="Render style"
        title={findStyle(style)?.clause || 'No style clause; describe it yourself'}
        className={select}
      >
        {STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      {/* No label: the model names are self-evident, and the price and seconds
          are what you need while choosing. */}
      <select
        value={model.id}
        onChange={(e) => onModel(e.target.value)}
        aria-label="Model"
        className={`${select} max-w-44`}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} · ${m.measuredUsd.toFixed(3)} · {m.measuredSeconds}s
          </option>
        ))}
      </select>

      {/* One flex item each, so a label, slider and readout can never be split
          across a wrap or collide with the control beside them. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={label}>Faithfulness</span>
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

      <div className="flex items-center gap-1.5 shrink-0">
        <span className={label}>Effort</span>
        {model.effortAxis ? (
          <>
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={effort}
              onChange={(e) => onEffort(Number(e.target.value) as EffortLevel)}
              className="range range-xs w-20"
            />
            <span className="text-xs text-base-content/50 w-20">
              {EFFORT_LABELS[effort]} {model.effortStops[effort]}
            </span>
          </>
        ) : (
          <span
            className="text-xs text-base-content/40"
            title={`${model.label} renders at one quality, so there is nothing to trade off`}
          >
            fixed
          </span>
        )}
      </div>

      {model.slowAtHighEffort && effort >= 2 && (
        <span className="text-xs text-warning" title={model.priceNote}>
          may exceed 50s
        </span>
      )}
    </>
  );
}
