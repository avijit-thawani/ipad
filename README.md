# ipad

<!-- Keep this file under 100 lines. If it goes over, compress immediately:
     tighten prose, drop what is no longer surprising, or move reference
     material to GOTCHAS.md or docs/. Do not let it grow into documentation. -->

Sketch-to-image on an iPad with an Apple Pencil, instead of yet another
text-to-image box: you draw the composition, pick how it should be rendered,
and the model gets the part a prompt cannot express. A web app, not a Swift
app, because Safari has had the stylus half of `PointerEvent` since iPadOS 13.5
and [tldraw](https://tldraw.dev) already does pressure strokes and palm
rejection. Behind one password, because Generate spends money.

| Where | What it is |
|---|---|
| `src/` | `pages/DrawPage.tsx` is the layout, `components/` the bar and transcript. |
| [`shared/prompts.ts`](shared/prompts.ts) | **every word sent to a model**: preamble, the five faithfulness clauses, the styles, `buildPrompt`. If output disappoints, read this and nothing else. |
| [`shared/models.ts`](shared/models.ts) | the catalog: what each model costs, measures and actually accepts. |
| `netlify/functions/` | `login` issues a token, `generate` holds the key. |
| [`tools/`](tools), [`docs/`](docs) | `compare-models.ts` and `compare-adherence.ts` spend real money to measure, so defaults are chosen not guessed; `docs/` holds the design questions. |

## The one rule

The OpenRouter key never leaves the function; `generate` starts with
`requireAuth` and re-validates every choice. Nothing in the bundle is prefixed
`VITE_` bar the tldraw license key, which is meant to be public.

## How to serve

```bash
cp .env.example .env     # APP_PASSWORD, APP_SECRET, OPENROUTER_API_KEY
npm install
BROWSER=none npm run dev                   # :5173, bound to the LAN
npx netlify functions:serve --port 9999    # both are needed
```

Open `http://<mac-lan-ip>:5173` **on the iPad** — Vite prints it as `Network:`.
Pointer events need no secure context, so plain HTTP over wifi gives real
Pencil input with hot reload, and the Mac cannot test this app's only input
device. Allow `node` through the macOS firewall or the iPad hangs silently. Vite
hot-reloads the UI; **restart the functions server** after touching `netlify/`
or `.env`. `npm run build` is the gate; there is no test framework.

## Status

**Works end to end**: sketch, one tap, a render comes back. Everything survives
a reload — the sketch via tldraw's IndexedDB, the transcript and last render via
ours. Unconfirmed on hardware: whether stroke width tracks pressure, and whether
Scribble drops taps. Not built: server-side storage, and the free-text box
(commented out in `DrawPage`, still wired through). `DEBUG_SAVE_RENDERS=1` logs
every round to `renders/`.

## The controls

Landscape only, the bar mirroring the panes: canvas left (pen, eraser, select,
colour, stroke, undo, redo, clear), render right (style, model, faithfulness,
effort, Generate). tldraw's own UI is off (`HIDDEN_UI`); the History toggle,
Save, Clear and Log out sit over the render's top right. Panes are half the
width each and the sketch exports at the **viewport** bounds, not the shapes'
bounding box, so the render is the same shape as what you drew in.

| Axis | How orthogonal it really is |
|---|---|
| **Style** | Completely — only text appended to the prompt, so every model takes it. |
| **Faithfulness** | Completely, same reason. Five hand-written clauses, Interpret to Literal, each naming what may drift: position, proportion, orientation, expression, colour. |
| **Model** | Completely — just a slug. |
| **Effort** | Not underneath. No image model has a reasoning-effort concept; `quality` (9 of 52) and `resolution` (19) are different parameters. Mapped per model, hidden where a model has neither. |

Aspect ratio is derived from the canvas, not chosen. The picker shows
**measured** cost and seconds: OpenRouter publishes no latency and bills most
models per output token, so advertised figures were wrong by up to 7x. Default
is Nano Banana 2 Lite — fastest measured, and one quality whatever the effort.

**Design choices.** Faithfulness is five hand-written clauses, not a 1-10
scale, because a bare number steers a model poorly. Every default traces to a
`tools/` run rather than a published figure.

## History, off by default

Off, one reference goes up: the sketch in front of you. **On**, the right pane
becomes a transcript — sketch and render paired per round — and every *visible*
message is sent as context, buying consistency and billed per input image. Each
message hides individually, so that is where you choose what the model sees,
and hidden state survives a reload. References are downscaled to 768px and
capped by the model's own limit (16 GPT, 14 Gemini, 8 FLUX). Reasoning:
[docs/past-generations.md](docs/past-generations.md).

## Gotchas

Turn **Scribble off** in iPad Settings > Apple Pencil, or Safari drops every
other `pointerdown`. And **dev is lowered for Safari separately from the build**
via `optimizeDeps.rolldownOptions.transform.target` plus deleting
`node_modules/.vite`. The rest: [GOTCHAS.md](GOTCHAS.md).

## Next

- **Seed** — two models support it, so one variable could be held still.
- **GLM 5.3 Flash cannot render** but reads images, so it could critique a
  sketch or write the prompt. Every GLM on OpenRouter is text-out only.
