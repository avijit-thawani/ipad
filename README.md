# ipad

<!-- Keep this file under 100 lines. If it goes over, compress immediately:
     tighten prose, drop what is no longer surprising, or move reference
     material to GOTCHAS.md. Do not let it grow into documentation. -->

Sketch-to-image on an iPad with an Apple Pencil, instead of yet another
text-to-image box. You draw the composition, type what it should become, and an
image model gets **both**. The drawing is the part a prompt cannot express, so
the prompt stops having to carry the whole idea.

A web app, not a Swift app: Safari has supported the stylus half of
`PointerEvent` since iPadOS 13.5, and [tldraw](https://tldraw.dev) already does
pressure-responsive strokes, palm rejection, colours and undo, so there was
nothing worth hand-rolling. Behind one password, because the Generate button
spends real money.

| Folder | What it is |
|---|---|
| `src/` | the app. `pages/DrawPage.tsx` is the whole product; everything else is plumbing. |
| `netlify/functions/` | `login` issues a token, `generate` is the only thing holding the OpenRouter key. |
| `netlify/lib/auth.ts` | HMAC token + constant-time password compare, lifted from `vote`. |

## The one rule

The OpenRouter key never leaves the function, and `generate` starts with
`requireAuth`. Nothing in the bundle is prefixed `VITE_` except the tldraw
license key, which is designed to be public. A stranger who finds the URL can
look at the login box and nothing else.

## Quick start

```bash
cp .env.example .env     # fill APP_PASSWORD, APP_SECRET, OPENROUTER_API_KEY
npm install
BROWSER=none npm run dev           # :5173, bound to the LAN
npx netlify functions:serve        # :9999, proxied from Vite. Both are needed.
```

Then open `http://<mac-lan-ip>:5173` **on the iPad** — Vite prints the address
as `Network:`. Pointer events need no secure context, so plain HTTP over wifi
gives genuine Pencil input with hot reload. This matters more than it sounds:
the Mac cannot test the only input device the app has, and a Netlify deploy per
change is a miserable way to find out a stroke feels wrong. macOS will prompt
to allow incoming connections for `node` the first time; if it was dismissed,
the iPad hangs with no error and the firewall is the reason.

`npm run build` is the gate — `tsc -b` covers the app *and* the functions, since
the function is where the money is. No test framework, matching the siblings.

## Status

Built: password gate, canvas with IndexedDB persistence, PNG export, one round
of sketch + prompt to a render, a session strip of past rounds. Auth, payload
validation and upstream error passthrough are verified by curl; the login
screen renders on the iPad.

**Nothing has been drawn with an actual Pencil yet**, so the pressure and
Scribble notes below come from the literature rather than from use, and no
generated image has ever been produced. Not built: iterating on a previous
round, AI strokes returning to the canvas, server-side storage.

Because the device has no reachable console, failures print themselves onto the
page — an `ErrorBoundary`, plus an ES5 handler in `index.html` that is
deliberately not a module so it survives a syntax error in the bundle. Both end
with the user agent, which is what identifies a Safari too old for something.

## Gotchas

Two that shape the code, rather than just the setup. Turn **Scribble off** in
iPad Settings > Apple Pencil, or Safari drops every other `pointerdown`. And
**dev must be lowered for Safari separately from the build**: tldraw contains a
class static block (Safari 16.4+), `build.target` does not touch dev, and the
option that works is `optimizeDeps.rolldownOptions.transform.target` followed by
deleting `node_modules/.vite`. Getting this wrong shows up as `Unexpected token
'{'` at *login*, because the canvas is imported lazily.

The rest, including everything that cost a debugging round, is in
[GOTCHAS.md](GOTCHAS.md).

## Next

- **Iterate on a round** rather than starting over: the model takes up to 14
  reference images, so passing the previous render alongside the new sketch is
  a small change to `generate.ts`, and the obvious next feature.
- **Style buttons instead of describing a style every time.** The prompt is
  currently one preamble in `generate.ts` (telling the model its input is a
  sketch to realise, not pencil lines to copy) plus whatever you type; with an
  empty box the model picks a style itself. Presets — ink, watercolour, 3D
  render, photo, blueprint — appended as a clause would make a round two taps.
- **Model is one env var**, so comparing them is a `IMAGE_MODEL` edit. Verified
  slugs that accept `input_references`: `google/gemini-3.1-flash-image` (Nano
  Banana 2, the current default), `meta/muse-image`,
  `openai/gpt-image-2.5-sunburst` and `-flare`, `openai/gpt-image-2`,
  `bytedance-seed/seedream-5-0-pro`, `black-forest-labs/flux.2-pro`. A picker
  in the UI beats an env var once there is more than one worth keeping.
- **GLM 5.3 Flash cannot do this job.** `z-ai/glm-5.3-flash` reads images but
  emits text only, as does every GLM on OpenRouter — it suits critiquing a
  sketch or proposing the prompt, not generating the render.
