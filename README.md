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
change is a miserable way to find out a stroke feels wrong.

`npm run build` is the gate — `tsc -b` covers the app *and* the functions, since
the function is where the money is. No test framework, matching the siblings.

## Status

Working: password gate, canvas with local IndexedDB persistence, export to PNG,
one round of sketch + prompt to a render, a session strip of past rounds.

Verified by curl, not yet on hardware: auth rejects absent, forged and expired
tokens; the sketch must be an image data URL and under 4 MB; an upstream failure
is passed through with its status instead of becoming a blank 502. **Nobody has
drawn on this with an actual Pencil yet** — that is the next thing that happens,
and the pressure and Scribble notes below are from the literature, not from use.

Not built yet: iterating on a previous round, AI strokes coming back onto the
canvas, any server-side storage.

## Gotchas

- **Scribble eats every other `pointerdown`.** A long-standing Safari bug, not a
  tldraw one: tap twice quickly with the Pencil and the second is dropped. Fix
  is iPad Settings > Apple Pencil > Scribble, off. There is a known
  `preventDefault` on `touchmove` workaround, deliberately not applied here
  because it also kills two-finger pan — reach for it only if the settings
  change is not enough.
- **Safari still has no `getCoalescedEvents()`.** The Pencil samples at 240 Hz,
  you see one sample per frame, so fast strokes come out as chords. Turn off
  Settings > Safari > *Prefer Page Rendering Updates near 60fps* and keep Low
  Power Mode off. There is no way to recover the dropped samples.
- **tldraw needs a license key in production.** It runs unlicensed on
  localhost, but on an HTTPS non-localhost domain it logs license errors. A
  hobby license is free, discretionary, and keeps a "made with tldraw"
  watermark you may not obscure. Request it *before* the first deploy.
- **localStorage cannot hold the renders.** Two ~1 MB base64 PNGs per round
  against a ~5 MB quota means the third sketch would fail. The session strip
  stores 320px JPEG thumbnails; full-resolution output lives in memory only, so
  Download it or lose it on reload.
- **Netlify's synchronous limit is 60s**, not the 10s the forums still talk
  about. Generation takes 15-20s, which fits, and the function bails at 50s to
  return a real message. The tighter constraint is the 6 MB buffered payload,
  which is why the sketch exports at `pixelRatio: 1`.

## Next

- **Iterate on a round** rather than starting over: the model takes up to 14
  reference images, so the previous render plus the new sketch is a small change
  to `generate.ts` and the obvious next feature.
- **Model is one env var.** `IMAGE_MODEL` defaults to
  `google/gemini-3.1-flash-image` (~$0.06/image); Seedream 4.5 and FLUX are a
  dashboard edit away. Anything set here must support `input_references`.
- **The prompt preamble is doing real work.** Told nothing, the model faithfully
  reproduces wobbly pencil lines instead of realising the drawing. That one
  paragraph in `generate.ts` is the difference between sketch-to-image and
  sketch-cleanup, and is the first thing to tune if output disappoints.
