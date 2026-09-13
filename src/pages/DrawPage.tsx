import { useEffect, useRef, useState } from 'react';
import { Box, Tldraw, type Editor, type TLUiComponents } from 'tldraw';
import 'tldraw/tldraw.css';
import { Unauthorized, clearToken, generate, type Generated } from '../lib/api';
import {
  clearTurns,
  contextImages,
  loadTurns,
  makeTurn,
  putTurn,
  type Turn,
} from '../lib/history';
import { clearLastRender, loadLastRender, saveLastRender } from '../lib/lastRender';
import {
  DEFAULT_MODEL_ID,
  findModel,
  nearestAspect,
  type EffortLevel,
} from '../../shared/models';
import { DEFAULT_ADHERENCE } from '../../shared/prompts';
import CanvasTools from '../components/CanvasTools';
import Progress from '../components/Progress';
import Settings from '../components/Settings';
import Transcript from '../components/Transcript';

/**
 * Whether history is fed back to the model. Persisted because it changes both
 * what the right pane shows and what a render costs, and having it silently
 * reset on reload would be a surprise in both directions.
 */
const HISTORY_KEY = 'ipad.history';

function loadHistoryOn(): boolean {
  try {
    return localStorage.getItem(HISTORY_KEY) === '1';
  } catch {
    return false;
  }
}

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

  // Empty while the free-text box is commented out below. Still sent with every
  // request, so restoring the box means changing this back to useState('') and
  // uncommenting the input — nothing else.
  const prompt = '';
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [style, setStyle] = useState('none');
  // Lowest by default: it is the cheapest and fastest, and on a resolution-axis
  // model it is also the only setting that cannot quietly cost more than it is
  // worth. Raise it deliberately.
  const [effort, setEffort] = useState<EffortLevel>(0);
  // 4 of 5 ("Faithful") is closest to what the preamble used to demand
  // unconditionally, so the default behaviour is roughly unchanged.
  const [adherence, setAdherence] = useState(DEFAULT_ADHERENCE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Generated | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [historyOn, setHistoryOn] = useState(loadHistoryOn);

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

  // tldraw restores the sketch from IndexedDB on its own, so without this the
  // drawing came back after a reload and the render did not. The transcript
  // comes from the same place, hidden flags and all.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cached, stored] = await Promise.all([loadLastRender(), loadTurns()]);
      if (cancelled) return;
      if (cached) {
        setResult({ image: cached.image, model: cached.model, cost: null, elapsedMs: 0 });
      }
      setTurns(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    void clearTurns();
    void clearLastRender();
    setTurns([]);
    setResult(null);
  }

  /** Hidden messages stay on screen but drop out of the next request. */
  function toggleHidden(turn: Turn, which: 'sketch' | 'render') {
    const next: Turn =
      which === 'sketch'
        ? { ...turn, sketchHidden: !turn.sketchHidden }
        : { ...turn, renderHidden: !turn.renderHidden };
    setTurns((current) => current.map((t) => (t.id === next.id ? next : t)));
    void putTurn(next);
  }

  function setHistory(on: boolean) {
    setHistoryOn(on);
    try {
      localStorage.setItem(HISTORY_KEY, on ? '1' : '0');
    } catch {
      // The toggle still works for this session if storage is blocked.
    }
  }

  async function onGenerate() {
    if (!editor || busy) return;

    if (editor.getCurrentPageShapeIds().size === 0) {
      setError('Draw something first.');
      return;
    }

    setBusy(true);
    setError('');
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
        adherence,
        // Empty unless the toggle is on, so the default request is exactly what
        // it was before history existed. The sketch takes one reference slot.
        history: historyOn ? contextImages(turns, model.maxReferences - 1) : [],
      });
      setResult(generated);
      void saveLastRender({
        image: generated.image,
        model: generated.model,
        at: new Date().toISOString(),
      });

      // Recording the round must not be able to lose it: the render is already
      // on screen by now, so a failure here is reported without discarding it.
      try {
        const turn = await makeTurn({
          prompt,
          model: generated.model,
          style,
          effort,
          adherence,
          aspect,
          elapsedMs: generated.elapsedMs,
          costUsd: generated.cost,
          sketch: url,
          render: generated.image,
        });
        await putTurn(turn);
        setTurns((current) => [...current, turn]);
      } catch (e) {
        setError(
          `The render is fine, but recording it failed: ${
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

  /** How many past messages the next request would carry, for the toggle. */
  const contextCount = historyOn ? contextImages(turns, model.maxReferences - 1).length : 0;

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

        <div className="relative w-1/2 min-w-0 flex items-center justify-center bg-base-100 overflow-hidden">
          {/* Session controls, not render controls — they belong to the page
              rather than to the next generation, so they sit up here instead
              of taking width in the control bar. */}
          <div className="absolute top-2 right-3 z-10 flex items-center gap-3 text-xs">
            {/* Both a view switch and a cost switch: on, the pane becomes the
                transcript and every visible message is sent with the next
                render — which is billed per input image. The count is the
                honest version of "history on". */}
            <label className="flex items-center gap-1.5 text-base-content/55">
              <input
                type="checkbox"
                checked={historyOn}
                onChange={(e) => setHistory(e.target.checked)}
                className="checkbox checkbox-xs"
              />
              History{historyOn && turns.length > 0 ? ` · ${contextCount} sent` : ''}
            </label>

            {result && (
              <a href={result.image} download="render.png" className="link text-base-content/50">
                Save
              </a>
            )}
            {turns.length > 0 && (
              <button onClick={forget} className="link text-base-content/30">
                Clear
              </button>
            )}
            <button onClick={signOut} className="link text-base-content/30">
              Log out
            </button>
          </div>

          {historyOn ? (
            <Transcript
              turns={turns}
              onToggle={toggleHidden}
              busy={busy}
              liveRender={<Progress boundSeconds={model.measuredSeconds} />}
            />
          ) : busy ? (
            <Progress boundSeconds={model.measuredSeconds} />
          ) : result ? (
            <img
              src={result.image}
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

      <div className="shrink-0 border-t border-base-300 bg-base-200 px-3 pt-2.5 flex flex-col gap-2.5 safe-bottom">
        {/* A free-text box is commented out rather than deleted: the style and
            adherence dropdowns cover everything so far, and an empty textbox
            was only inviting work. `prompt` is still threaded through the
            request, so restoring this is one JSX block and nothing else.

        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What should it become?"
          className="flex-1 min-w-0 rounded-field bg-base-100 border-2 border-base-content/15
                     focus:border-primary/60 focus:outline-none px-3 py-2
                     placeholder:text-base-content/35 transition-colors"
        />
        */}

        {/* One row, two halves, mirroring the panes above: what governs the
            canvas on the left, what governs the render on the right. Each half
            is nowrap so the split survives, and the row scrolls rather than
            wraps if a model with an effort slider makes it too wide — a
            control bar that changes height when you change model is worse than
            one that occasionally scrolls. */}
        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          <CanvasTools editor={editor} />

          <div className="flex items-center gap-2 shrink-0">
            <Settings
              model={model}
              onModel={setModelId}
              style={style}
              onStyle={setStyle}
              effort={effort}
              onEffort={setEffort}
              adherence={adherence}
              onAdherence={setAdherence}
            />

            <button
              onClick={onGenerate}
              disabled={busy}
              className="btn btn-chunky btn-primary btn-sm rounded-field font-semibold shrink-0"
            >
              {busy ? 'Drawing…' : 'Generate'}
            </button>
          </div>
        </div>

        {/* The thumbnail strip that used to live here is gone: the transcript
            in the right pane does the same job better, and the strip grew
            under the bar as the session went on. */}
        {error && <p className="text-error text-xs truncate">{error}</p>}
      </div>
    </div>
  );
}
