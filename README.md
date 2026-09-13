# ipad

<!-- Keep this file under 100 lines. If it goes over, compress immediately:
     tighten prose, drop what is no longer surprising, or move reference
     material to GOTCHAS.md. Do not let it grow into documentation. -->

Sketch-to-image on an iPad with an Apple Pencil, instead of yet another
text-to-image box. You draw the composition, type what it should become, and an
image model gets **both** — the drawing being the part a prompt cannot express.

A web app, not a Swift app: Safari has supported the stylus half of
`PointerEvent` since iPadOS 13.5, and [tldraw](https://tldraw.dev) already does
pressure strokes, palm rejection, colours and undo. Behind one password,
because the Generate button spends real money.

| Folder | What it is |
|---|---|
| `src/` | `pages/DrawPage.tsx` is the layout; `components/` holds the two control bars. |
| `shared/models.ts` | the catalog and the four control axes, imported by **both** the UI and the function. |
| `netlify/functions/` | `login` issues a token, `generate` is the only holder of the OpenRouter key. |

## The one rule

The OpenRouter key never leaves the function; `generate` starts with
`requireAuth` and re-validates every choice. Nothing in the bundle is prefixed
`VITE_` bar the tldraw license key, which is meant to be public.

## Quick start

```bash
cp .env.example .env     # fill APP_PASSWORD, APP_SECRET, OPENROUTER_API_KEY
npm install
BROWSER=none npm run dev           # :5173, bound to the LAN
npx netlify functions:serve        # :9999, proxied from Vite. Both are needed.
```

Then open `http://<mac-lan-ip>:5173` **on the iPad** — Vite prints it as
`Network:`. Pointer events need no secure context, so plain HTTP over wifi
gives genuine Pencil input with hot reload, and the Mac cannot test the only
input device this app has. Allow `node` through the macOS firewall when asked,
or the iPad hangs with no error.

`npm run build` is the gate — `tsc -b` covers the app *and* the functions,
since that is where the money is. No test framework, matching the siblings.

## Status

**It works end to end**: sketched on the iPad, one tap, a render came back.
Auth, payloads and error passthrough are verified by curl. Unconfirmed on
hardware: whether stroke width tracks Pencil pressure, and whether Scribble
drops taps. Not built: iterating on a round, server-side storage.

`DEBUG_SAVE_RENDERS=1` writes every sketch, render and prompt to `renders/`
(gitignored) plus model, cost and seconds to `renders/log.jsonl`, append-only
so it survives a restart. The device has no reachable console, so failures
print onto the page via an `ErrorBoundary` plus an ES5 handler in `index.html`
— not a module, so it survives a syntax error in the bundle. Both end with the
user agent.

## The four controls

Landscape only: canvas left, render right, controls in one bottom bar. tldraw's
own UI is off (`HIDDEN_UI`), replaced by pen and eraser alone. Both panes are
half the width, and the sketch exports at the **viewport** bounds, not the
shapes' bounding box — so the render is the same shape as the space you drew in.

| Axis | How orthogonal it really is |
|---|---|
| **Style** | Completely — only text appended to the prompt, so every model takes it. |
| **Sketch** | Completely, same reason: 1-10 adherence, rendered as a clause. No model has a fidelity parameter. |
| **Model** | Completely — just a slug. |
| **Effort** | Not underneath. No image model has a reasoning-effort concept; `quality` (9 of 52) and `resolution` (19) are different parameters. One slider per model, disabled where neither exists, lowest by default. |

Aspect ratio is derived, not chosen. The picker shows **measured** cost and
seconds from `tools/compare-models.ts --yes`, which renders one sketch through
every model in parallel — OpenRouter publishes no latency and bills most models
per output token, so advertised figures were wrong by up to 7x.

## Gotchas

Turn **Scribble off** in iPad Settings > Apple Pencil, or Safari drops every
other `pointerdown`. And **dev is lowered for Safari separately from the
build** via `optimizeDeps.rolldownOptions.transform.target` plus deleting
`node_modules/.vite`; get it wrong and tldraw's class static block shows as
`Unexpected token '{'` at *login*, since the canvas loads lazily.

Everything else that cost a debugging round is in [GOTCHAS.md](GOTCHAS.md).

## Next

- **Iterate on a round** rather than starting over: models take up to 14
  reference images, so passing the previous render alongside the new sketch is
  a small change to `generate.ts`, and the obvious next feature.
- **Seed, for holding one variable still** — two models support it
  (`supportsSeed`), so you could change only the style and see only that change.
- **A cheaper preview pass.** Nano Banana 2 Lite is half the price and ~2.7x
  faster, so draft-then-commit would cost less than one careful render.
- **GLM 5.3 Flash cannot render**, but it reads images — so it could critique a
  sketch or write the prompt for you. Every GLM on OpenRouter is text-out only.
