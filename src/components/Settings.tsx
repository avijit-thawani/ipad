import { EFFORT_LABELS, MODELS, STYLES, type EffortLevel, type ModelSpec } from '../../shared/models';
import type { Observed } from '../lib/history';

/**
 * The three control axes, which are orthogonal in the interface but not in the
 * request:
 *
 * - **Style** is pure text appended to the prompt, so every model takes it.
 * - **Model** is the slug.
 * - **Effort** is the leaky one. There is no reasoning-effort concept for image
 *   models; the nearest equivalents are `quality` (only 9 of 52 models) and
 *   `resolution` (19), which are different parameters with different values.
 *   The slider is one control whose stops map to whichever the chosen model
 *   exposes, and it disables itself for models that expose neither rather than
 *   pretending to do something.
 */
export default function Settings({
  model,
  onModel,
  style,
  onStyle,
  effort,
  onEffort,
  aspect,
  observed,
}: {
  model: ModelSpec;
  onModel: (id: string) => void;
  style: string;
  onStyle: (id: string) => void;
  effort: EffortLevel;
  onEffort: (level: EffortLevel) => void;
  aspect: string;
  observed: Observed | null;
}) {
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-field text-xs font-medium border transition-colors ${
      active
        ? 'bg-primary text-primary-content border-primary'
        : 'bg-base-100 border-base-content/15 text-base-content/70'
    }`;

  return (
    <div className="flex items-center gap-3 flex-wrap">
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
                   focus:border-primary/60 focus:outline-none max-w-56"
      >
        {/* Measured figures rather than advertised ones: the label is what you
            actually paid and waited, from tools/compare-models.ts. */}
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} · ${m.measuredUsd.toFixed(3)} · {m.measuredSeconds}s
            {m.exceedsCap ? ' · too slow' : ''}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <label
          className={`text-xs whitespace-nowrap ${
            model.effortAxis ? 'text-base-content/60' : 'text-base-content/30'
          }`}
        >
          Effort
        </label>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={effort}
          disabled={!model.effortAxis}
          onChange={(e) => onEffort(Number(e.target.value) as EffortLevel)}
          className="range range-xs w-28 disabled:opacity-30"
        />
        <span className="text-xs text-base-content/50 w-24 whitespace-nowrap">
          {model.effortAxis
            ? `${EFFORT_LABELS[effort]} · ${model.effortAxis} ${model.effortStops[effort]}`
            : 'not offered'}
        </span>
      </div>

      {/* Shown rather than chosen: it is derived from the canvas so the render
          comes back the same shape as what you drew. */}
      <span className="text-xs text-base-content/40 whitespace-nowrap">shape {aspect}</span>

      {model.exceedsCap ? (
        <span className="text-xs text-error whitespace-nowrap">
          measured {model.measuredSeconds}s — over the 50s cap even at Draft
        </span>
      ) : (
        model.slowAtHighEffort &&
        effort >= 2 && (
          <span className="text-xs text-warning whitespace-nowrap" title={model.priceNote}>
            may exceed the 50s cap
          </span>
        )
      )}

      <span className="text-xs text-base-content/40 whitespace-nowrap">
        {observed
          ? `measured ${(observed.meanMs / 1000).toFixed(1)}s${
              observed.meanCost !== null ? ` · $${observed.meanCost.toFixed(3)}` : ''
            } over ${observed.runs}`
          : model.blurb}
      </span>
    </div>
  );
}
