import { useRef, useState } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Unauthorized, clearToken, generate, type Generated } from '../lib/api';
import { clearTurns, loadTurns, saveTurns, thumbnail, type Turn } from '../lib/history';

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

      const turn: Turn = {
        id: crypto.randomUUID(),
        prompt,
        model: generated.model,
        at: new Date().toISOString(),
        sketchThumb: await thumbnail(url),
        resultThumb: await thumbnail(generated.image),
      };
      setTurns(saveTurns([turn, ...turns]));
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
    <div className="h-full flex flex-col md:flex-row">
      <div className="relative flex-1 min-h-0">
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
        className="flex flex-col gap-3 shrink-0 border-t md:border-t-0 md:border-l
                   border-base-300 bg-base-200 p-4 md:w-96 md:h-full safe-bottom"
      >
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Sketch</h1>
          <button onClick={signOut} className="btn btn-ghost btn-xs text-base-content/50">
            Sign out
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Render this as a watercolour street scene at dusk…"
          rows={3}
          className="w-full resize-none rounded-box bg-base-100 border-2 border-base-content/15
                     focus:border-primary/60 focus:outline-none px-3 py-2.5
                     placeholder:text-base-content/35 transition-colors"
        />

        <button
          onClick={onGenerate}
          disabled={busy}
          className="btn btn-chunky btn-primary btn-block rounded-field font-semibold"
        >
          {busy ? 'Drawing… (~20s)' : 'Generate'}
        </button>

        {error && <p className="text-error text-sm">{error}</p>}

        <div className="flex-1 min-h-40 rounded-box bg-base-100 border-2 border-base-content/10 overflow-hidden flex items-center justify-center">
          {shown ? (
            <img src={shown} alt="Generated render" className="w-full h-full object-contain animate-pop-in" />
          ) : (
            <p className="text-base-content/35 text-sm px-6 text-center">
              {busy ? 'Asking the model…' : 'Your render lands here.'}
            </p>
          )}
        </div>

        {result && !viewing && (
          <div className="flex items-center justify-between text-xs text-base-content/50">
            <a href={result.image} download="render.png" className="link">
              Download
            </a>
            <span>
              {result.model.split('/').pop()}
              {result.cost !== null && ` · $${result.cost.toFixed(3)}`}
            </span>
          </div>
        )}

        {turns.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-base-content/45">
              <span>{turns.length} rounds this session</span>
              <button onClick={forget} className="link">
                Forget
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
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
                  <img src={turn.resultThumb} alt={turn.prompt} className="w-14 h-14 object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
