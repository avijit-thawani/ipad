import { useEffect, useState } from 'react';

/**
 * A determinate bar for a wait whose length we can only estimate.
 *
 * `expectedSeconds` is the model's measured time from the catalog, so the bar
 * is honest for a typical run rather than a fake animation. Two rules keep it
 * from lying: it eases towards 95% instead of reaching the end, because
 * arriving at 100% and then waiting is worse than no bar at all; and once it
 * passes the estimate it says so, since at that point the estimate is the
 * thing that was wrong.
 */
export default function Progress({ expectedSeconds }: { expectedSeconds: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  const fraction = Math.min(elapsed / Math.max(expectedSeconds, 1), 1);
  // Ease out, so it slows as it approaches the estimate rather than stopping dead.
  const percent = Math.min(95, Math.round((1 - Math.pow(1 - fraction, 2)) * 95));
  const over = elapsed > expectedSeconds;

  return (
    <div className="w-56 flex flex-col gap-2 items-center">
      <div className="w-full h-1.5 rounded-full bg-base-content/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
            over ? 'bg-warning' : 'bg-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-base-content/40 tabular-nums">
        {over
          ? `${elapsed.toFixed(0)}s — longer than the usual ${expectedSeconds}s`
          : `${elapsed.toFixed(0)}s of about ${expectedSeconds}s`}
      </p>
    </div>
  );
}
