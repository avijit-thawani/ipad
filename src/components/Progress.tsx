import { useEffect, useState } from 'react';

/**
 * Progress against an upper bound, not against an average.
 *
 * `boundSeconds` is the model's measured time from the catalog, treated as the
 * worst case. So the bar shows *how much of the budget has been spent*, not a
 * guess at how much work is done: it advances linearly and reaches full
 * exactly at the bound. Finishing early is the normal case and simply cuts the
 * bar short — the caller swaps in the render the moment it arrives, so there
 * is no need to pad the end.
 *
 * This is deliberately not the usual decelerating curve. That shape exists to
 * stop a bar built on a *mean* from hitting 100% while still waiting; with a
 * bound, arriving at 100% is meaningful — it says the estimate has been used
 * up — so easing would only misreport the one thing the bar knows.
 *
 * One measurement on one sketch is not a guaranteed ceiling, so overrunning is
 * possible and gets its own state rather than a stuck bar.
 */
export default function Progress({ boundSeconds }: { boundSeconds: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  const bound = Math.max(boundSeconds, 1);
  const over = elapsed > bound;
  const percent = Math.min(100, (elapsed / bound) * 100);

  return (
    <div className="w-56 flex flex-col gap-2 items-center">
      <div className="w-full h-1.5 rounded-full bg-base-content/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            over ? 'bg-warning animate-pulse' : 'bg-primary transition-[width] duration-100 ease-linear'
          }`}
          style={{ width: `${over ? 100 : percent}%` }}
        />
      </div>
      <p className="text-xs text-base-content/40 tabular-nums">
        {over
          ? `${elapsed.toFixed(0)}s — past the usual ${boundSeconds}s, still going`
          : `${elapsed.toFixed(0)}s of at most ${boundSeconds}s`}
      </p>
    </div>
  );
}
