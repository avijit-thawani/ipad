import { useEffect, useRef, useState } from 'react';
import { Box, Tldraw, type Editor, type TLUiComponents } from 'tldraw';
import 'tldraw/tldraw.css';
import { Unauthorized, clearToken, generate, type Generated } from '../lib/api';
import { clearTurns, loadTurns, makeTurn, saveTurns, type Turn } from '../lib/history';
import {
  DEFAULT_FIDELITY,
  DEFAULT_MODEL_ID,
  findModel,
  nearestAspect,
  type EffortLevel,
} from '../../shared/models';
import CanvasTools from '../components/CanvasTools';
import Progress from '../components/Progress';
import Settings from '../components/Settings';

/**
 * Client-side validated and domain-restricted, so shipping it in the bundle is
 * safe and intended. Absent in dev, where tldraw runs unlicensed on localhost.
 */
const LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY as string | undefined;

/**
 * Everything tldraw would normally float over the canvas is switched off, so
 * the left pane is drawing surface and nothing else. The equivalent controls
 * are in the bottom bar, in `CanvasTools`.
 */
const HIDDEN_UI: TLUiComponents = {
  Toolbar: null,
  StylePanel: null,
  PageMenu: null,
  MainMenu: null,
  MenuPanel: null,
  ActionsMenu: null,
  QuickActions: null,
  ZoomMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  TopPanel: null,
  SharePanel: null,
  Minimap: null,
  ContextMenu: null,
};

export default function DrawPage({ onSignedOut }: { onSignedOut: () => void }) {
  const canvasPaneRef = useRef<HTMLDivElement | null>(null);
  /**
   * State rather than a ref: the bottom bar is a sibling of the canvas, so it
   * has to re-render once the editor exists or its buttons would stay wired to
   * nothing. Assigning a ref would not trigger that.
   */
  const [editor, setEditor] = useState<Editor | null>(null);

  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [style, setStyle] = useState('none');
  // Lowest by default: it is the cheapest and fastest, and on a resolution-axis
  // model it is also the only setting that cannot quietly cost more than it is
  // worth. Raise it deliberately.
  const [effort, setEffort] = useState<EffortLevel>(0);
  // 8 matches what the preamble used to demand unconditionally, so the default
  // behaviour is unchanged and the slider only opens up new territory.
  const [fidelity, setFidelity] = useState(DEFAULT_FIDELITY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Generated | null>(null);
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns());
  /** A past round being looked at, which shows its thumbnail, not a full render. */
  const [viewing, setViewing] = useState<Turn | null>(null);

  const model = findModel(modelId) ?? findModel(DEFAULT_MODEL_ID)!;

  /**
   * The shape of the canvas pane, snapped to the nearest ratio this model
   * supports. Both panes are exactly half the width and the same height, so
   * this is also the shape of the render pane — which is the point: the
   * generated image comes back the same shape as the space you drew in.
   *
   * Kept in state because it depends on layout, which React does not re-render
   * for; rotating the iPad has to update it.
   */
  const [paneSize, setPaneSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const pane = canvasPaneRef.current;
    if (!pane) return;
    const measure = () => setPaneSize({ w: pane.clientWidth, h: pane.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  const aspect = nearestAspect(model, paneSize.w, paneSize.h);

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

  async function onGenerate() {
    if (!editor || busy) return;

    if (editor.getCurrentPageShapeIds().size === 0) {
      setError('Draw something first.');
      return;
    }

    setBusy(true);
    setError('');
    setViewing(null);
    try {
      // Export the viewport rather than the shapes' bounding box. Exporting the
      // bounding box would make the sketch whatever shape you happened to draw
      // in, so the render would never match the pane. pixelRatio 1 because the
      // sketch is line art and Netlify caps the payload at 6 MB.
      const { url } = await editor.toImageDataUrl([...editor.getCurrentPageShapeIds()], {
        format: 'png',
        background: true,
        pixelRatio: 1,
        bounds: Box.From(editor.getViewportPageBounds()),
      });

      const generated = await generate(url, {
        prompt,
        model: model.id,
        style,
        effort,
        aspect,
        fidelity,
      });
      setResult(generated);

      // Recording the round must not be able to lose it: the render is already
      // on screen by now, so a failure here is reported without discarding it.
      try {
        const turn = await makeTurn({
          prompt,
          model: generated.model,
          style,
          effort,
          fidelity,
          aspect,
          elapsedMs: generated.elapsedMs,
          costUsd: generated.cost,
          sketch: url,
          result: generated.image,
        });
        setTurns(saveTurns([turn, ...turns]));
      } catch (e) {
        setError(
          `The render is fine, but saving it to the strip failed: ${
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

  const shown = viewing ? viewing.resultThumb : result?.image;

  return (
    // Three bands: two equal panes across the top, one full-width bar beneath.
    // Nothing may scroll the page, so every growable child carries min-h-0.
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex">
        <div ref={canvasPaneRef} className="relative w-1/2 min-w-0 border-r border-base-300">
          {/* persistenceKey alone gives local IndexedDB persistence of the whole
              document, so a Safari tab eviction mid-sketch is survivable. */}
          <Tldraw
            persistenceKey="ipad-sketch"
            licenseKey={LICENSE_KEY}
            components={HIDDEN_UI}
            onMount={setEditor}
          />
        </div>

        <div className="w-1/2 min-w-0 flex items-center justify-center bg-base-100 overflow-hidden">
          {busy ? (
            <Progress boundSeconds={model.measuredSeconds} />
          ) : shown ? (
            <img
              src={shown}
              alt="Generated render"
              className="max-w-full max-h-full object-contain animate-pop-in"
            />
          ) : (
            <p className="text-base-content/30 text-sm px-8 text-center">
              Your render lands here, in this shape.
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-base-300 bg-base-200 px-3 py-2 flex flex-col gap-2 safe-bottom">
        <CanvasTools editor={editor} />
        <Settings
          model={model}
          onModel={setModelId}
          style={style}
          onStyle={setStyle}
          effort={effort}
          onEffort={setEffort}
          fidelity={fidelity}
          onFidelity={setFidelity}
          aspect={aspect}
        />

        <div className="flex items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should it become? (a style button alone is enough)"
            className="flex-1 min-w-0 rounded-field bg-base-100 border-2 border-base-content/15
                       focus:border-primary/60 focus:outline-none px-3 py-2
                       placeholder:text-base-content/35 transition-colors"
          />
          <button
            onClick={onGenerate}
            disabled={busy}
            className="btn btn-chunky btn-primary rounded-field font-semibold shrink-0"
          >
            {busy ? 'Drawing…' : 'Generate'}
          </button>

          {turns.length > 0 && (
            <div className="flex gap-1.5 items-center shrink-0 max-w-[34%] overflow-x-auto overflow-y-hidden">
              {turns.map((turn) => (
                <button
                  key={turn.id}
                  onClick={() => {
                    setViewing(turn);
                    setPrompt(turn.prompt);
                  }}
                  title={`${turn.prompt || '(no prompt)'} — ${turn.model} · ${(
                    turn.elapsedMs / 1000
                  ).toFixed(1)}s`}
                  className={`shrink-0 rounded-field overflow-hidden border-2 transition-colors ${
                    viewing?.id === turn.id ? 'border-primary' : 'border-base-content/10'
                  }`}
                >
                  <img src={turn.resultThumb} alt={turn.prompt} className="w-9 h-9 object-cover" />
                </button>
              ))}
              <button onClick={forget} className="link text-xs text-base-content/40 shrink-0">
                Forget
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-error truncate">{error}</span>
          <span className="text-base-content/50 shrink-0 flex gap-3 items-center">
            {result && !viewing && (
              <a href={result.image} download="render.png" className="link">
                Download
              </a>
            )}
            <button onClick={signOut} className="link">
              Sign out
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
