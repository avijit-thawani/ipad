import { EFFORT_LABELS, MODELS, type EffortLevel, type ModelSpec } from '../../shared/models';
import { ADHERENCE, STYLES, findAdherence } from '../../shared/prompts';

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
 * Per-run timings and costs are deliberately not shown here — they go to
 * `renders/log.jsonl` on the server instead, which survives a restart. This
 * bar is for choosing, not for reading statistics.
 */
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
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-field text-xs font-medium border transition-colors ${
      active
        ? 'bg-primary text-primary-content border-primary'
        : 'bg-base-100 border-base-content/15 text-base-content/70'
    }`;

  return (
    // gap-x-4 with wrapping, and no fixed-width children: the readout used to
    // be a fixed w-24 with nowrap text, which ran under the next control.
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
      <div className="flex gap-1 items-center">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => onStyle(s.id)}
            title={s.clause || 'No style clause; describe it yourself'}
            className={chip(style === s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <select
        value={model.id}
        onChange={(e) => onModel(e.target.value)}
        className="rounded-field bg-base-100 border-2 border-base-content/15 px-2 py-1 text-xs
                   focus:border-primary/60 focus:outline-none"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} · ${m.measuredUsd.toFixed(3)} · {m.measuredSeconds}s
          </option>
        ))}
      </select>

      {/* One flex item, so the label, slider and readout can never collide
          with whatever wraps next to them. */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`text-xs ${
            model.effortAxis ? 'text-base-content/60' : 'text-base-content/30'
          }`}
        >
          Effort
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={effort}
          disabled={!model.effortAxis}
          onChange={(e) => onEffort(Number(e.target.value) as EffortLevel)}
          className="range range-xs w-24 disabled:opacity-30"
        />
        <span className="text-xs text-base-content/50">
          {model.effortAxis
            ? `${EFFORT_LABELS[effort]} · ${model.effortStops[effort]}`
            : 'fixed'}
        </span>
      </div>

      {/* Prompt text, not a request parameter — no model has a knob for this —
          so unlike effort it works identically on every model. Five stops
          because each is a hand-written variant, not an interpolated number. */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-base-content/60">Sketch</span>
        <input
          type="range"
          min={ADHERENCE[0].level}
          max={ADHERENCE[ADHERENCE.length - 1].level}
          step={1}
          value={adherence}
          onChange={(e) => onAdherence(Number(e.target.value))}
          className="range range-xs w-24"
          title={findAdherence(adherence)?.clause}
        />
        <span className="text-xs text-base-content/50">
          {findAdherence(adherence)?.label}
        </span>
      </div>

      {/* Shown rather than chosen: derived from the canvas so the render comes
          back the same shape as what you drew. */}
      <span className="text-xs text-base-content/40">{aspect}</span>

      {model.slowAtHighEffort && effort >= 2 && (
        <span className="text-xs text-warning" title={model.priceNote}>
          may exceed the 50s cap
        </span>
      )}
    </div>
  );
}
