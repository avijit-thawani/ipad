import { useRef, useState } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Unauthorized, clearToken, generate, type Generated } from '../lib/api';
import { clearTurns, loadTurns, makeTurn, saveTurns, type Turn } from '../lib/history';

/**
 * Client-side validated and domain-restricted, so shipping it in the bundle is
 * safe and intended. Absent in dev, where tldraw runs unlicensed on localhost.
 */
const LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY as string | undefined;

export default function DrawPage({ onSignedOut }: { onSignedOut: () => void }) {
  const editorRef = useRef<Editor | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Generated | null>(null);
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns());
  /** A past round being looked at, which shows its thumbnail rather than a full render. */
  const [viewing, setViewing] = useState<Turn | null>(null);

  async function onGenerate() {
    const editor = editorRef.current;
    if (!editor || busy) return;

    const shapeIds = [...editor.getCurrentPageShapeIds()];
    if (shapeIds.length === 0) {
      setError('Draw something first.');
      return;
    }

    setBusy(true);
    setError('');
    setViewing(null);
    try {
      // pixelRatio 1 on purpose. The sketch is line art, so a denser export
      // tells the model nothing extra, and Netlify caps a buffered request and
      // its response at 6 MB combined — which a 2x sketch plus a 1K render
      // gets uncomfortably close to.
      const { url } = await editor.toImageDataUrl(shapeIds, {
        format: 'png',
        background: true,
        pixelRatio: 1,
      });

      const generated = await generate(url, prompt);
      setResult(generated);

      // Recording the round must not be able to lose it: the render is already
      // on screen by now, so a failure here is reported without discarding it.
      try {
        const turn = await makeTurn({
          prompt,
          model: generated.model,
          sketch: url,
          result: generated.image,
        });
        setTurns(saveTurns([turn, ...turns]));
      } catch (e) {
        setError(
          `The render is fine, but saving it to the session strip failed: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    } catch (e) {
      if (e instanceof Unauthorized) {
        onSignedOut();
        return;
      }
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    clearToken();
    onSignedOut();
  }

  function forget() {
    clearTurns();
    setTurns([]);
    setViewing(null);
    setResult(null);
  }

  const shown = viewing ? viewing.resultThumb : result?.image;

  return (
    // Always two columns, never stacked: this only ever runs on an iPad, and
    // the point is to see the sketch and the render at once. Nothing here may
    // scroll the page, so every flex child that could grow carries min-h-0.
    <div className="h-full flex overflow-hidden">
      <div className="relative flex-1 min-w-0">
        {/* persistenceKey alone gives local IndexedDB persistence of the whole
            document, so a Safari tab eviction mid-sketch is survivable. */}
        <Tldraw
          persistenceKey="ipad-sketch"
          licenseKey={LICENSE_KEY}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />
      </div>

      <aside
        className="flex flex-col gap-2.5 shrink-0 overflow-hidden border-l border-base-300
                   bg-base-200 p-3 h-full w-[38%] min-w-[17rem] max-w-[28rem] safe-bottom"
      >
        {/* The render takes every pixel the controls do not need, because it is
            the thing you are looking at. Controls sit underneath, within reach
            of the hand already holding the Pencil. */}
        <div className="flex-1 min-h-0 rounded-box bg-base-100 border-2 border-base-content/10 overflow-hidden flex items-center justify-center">
          {shown ? (
            <img
              src={shown}
              alt="Generated render"
              className="max-w-full max-h-full object-contain animate-pop-in"
            />
          ) : (
            <p className="text-base-content/35 text-sm px-6 text-center">
              {busy ? 'Asking the model…' : 'Your render lands here.'}
            </p>
          )}
        </div>

        {result && !viewing && (
          <div className="flex items-center justify-between text-xs text-base-content/50 shrink-0">
            <a href={result.image} download="render.png" className="link">
              Download full size
            </a>
            <span>
              {result.model.split('/').pop()}
              {result.cost !== null && ` · $${result.cost.toFixed(3)}`}
            </span>
          </div>
        )}

        {error && <p className="text-error text-sm shrink-0">{error}</p>}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Render this as a watercolour street scene at dusk…"
          rows={2}
          className="w-full shrink-0 resize-none rounded-box bg-base-100 border-2
                     border-base-content/15 focus:border-primary/60 focus:outline-none
                     px-3 py-2 placeholder:text-base-content/35 transition-colors"
        />

        <button
          onClick={onGenerate}
          disabled={busy}
          className="btn btn-chunky btn-primary btn-block rounded-field font-semibold shrink-0"
        >
          {busy ? 'Drawing… (~20s)' : 'Generate'}
        </button>

        {turns.length > 0 && (
          <div className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center justify-between text-xs text-base-content/45">
              <span>{turns.length} rounds</span>
              <button onClick={forget} className="link">
                Forget
              </button>
            </div>
            {/* Horizontal only: a vertical scroller here would be the thing
                that makes the panel scroll. */}
            <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1">
              {turns.map((turn) => (
                <button
                  key={turn.id}
                  onClick={() => {
                    setViewing(turn);
                    setPrompt(turn.prompt);
                  }}
                  title={turn.prompt || '(no prompt)'}
                  className={`shrink-0 rounded-field overflow-hidden border-2 transition-colors ${
                    viewing?.id === turn.id ? 'border-primary' : 'border-base-content/10'
                  }`}
                >
                  <img src={turn.resultThumb} alt={turn.prompt} className="w-12 h-12 object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={signOut}
          className="btn btn-ghost btn-xs text-base-content/40 shrink-0 self-end"
        >
          Sign out
        </button>
      </aside>
    </div>
  );
}
