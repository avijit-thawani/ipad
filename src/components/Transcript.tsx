import { useEffect, useRef } from 'react';
import { findAdherence, findStyle } from '../../shared/prompts';
import type { Turn } from '../lib/history';

/**
 * The session as a conversation: each round is your sketch, then the render it
 * produced, one pair per press of Generate.
 *
 * Hiding is the point of the view rather than a tidying feature — a hidden
 * message stays on screen but is dropped from the next request, so this is
 * where you choose what the model sees. Hidden messages are dimmed rather than
 * removed, because you have to be able to put them back.
 *
 * Deliberately not shown: the model name, the effort setting, and the full
 * prompt. Those describe how a render was produced rather than what you asked
 * for, and the transcript is about the latter. They are in
 * `renders/log.jsonl`.
 */
export default function Transcript({
  turns,
  onToggle,
  liveRender,
  busy,
}: {
  turns: Turn[];
  onToggle: (turn: Turn, which: 'sketch' | 'render') => void;
  /** Rendered below the transcript while a round is in flight. */
  liveRender: React.ReactNode;
  busy: boolean;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // A transcript that does not follow the newest message makes you scroll
  // after every generation.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  const message = (hidden: boolean) =>
    `relative rounded-box overflow-hidden border-2 transition-opacity ${
      hidden ? 'opacity-30 border-dashed border-base-content/30' : 'border-base-content/10'
    }`;

  const hideButton =
    'absolute top-1 right-1 px-1.5 py-0.5 rounded-field text-[10px] leading-none ' +
    'bg-base-100/90 border border-base-content/20 text-base-content/70';

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-3 py-3 flex flex-col gap-3">
      {turns.length === 0 && !busy && (
        <p className="text-base-content/30 text-sm text-center my-auto px-6">
          Your sketches and renders will appear here as a conversation.
        </p>
      )}

      {turns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-1.5">
          {/* Your side: the sketch, plus the two choices that shaped the ask. */}
          <div className="flex justify-end">
            <div className="max-w-[78%] flex flex-col items-end gap-1">
              <div className={message(turn.sketchHidden)}>
                <img src={turn.sketchThumb} alt="Sketch" className="w-full h-auto block" />
                <button
                  onClick={() => onToggle(turn, 'sketch')}
                  className={hideButton}
                  title={
                    turn.sketchHidden
                      ? 'Hidden — not sent with the next generation'
                      : 'Hide, so this is not sent with the next generation'
                  }
                >
                  {turn.sketchHidden ? 'show' : 'hide'}
                </button>
              </div>
              <span className="text-[10px] text-base-content/45">
                {findStyle(turn.style)?.label} · {findAdherence(turn.adherence)?.label}
              </span>
            </div>
          </div>

          {/* The model's side: what came back. */}
          <div className="flex justify-start">
            <div className="max-w-[78%]">
              <div className={message(turn.renderHidden)}>
                <img src={turn.renderThumb} alt="Render" className="w-full h-auto block" />
                <button
                  onClick={() => onToggle(turn, 'render')}
                  className={hideButton}
                  title={
                    turn.renderHidden
                      ? 'Hidden — not sent with the next generation'
                      : 'Hide, so this is not sent with the next generation'
                  }
                >
                  {turn.renderHidden ? 'show' : 'hide'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {busy && <div className="flex justify-start py-2">{liveRender}</div>}

      <div ref={endRef} />
    </div>
  );
}
