# Gotchas

Each of these cost a debugging round. Verified Sept 2026, iPad + Pencil 1.

## Safari and the Pencil

- **Scribble eats every other `pointerdown`.** A long-standing Safari bug, not
  a tldraw one: tap twice quickly and the second tap is dropped. Fix is iPad
  Settings > Apple Pencil > Scribble, off. There is a known workaround of
  calling `preventDefault` on a `touchmove` listener bound to the canvas; it is
  deliberately not applied here because it also kills two-finger pan. Reach for
  it only if turning Scribble off is not enough.
- **Safari still has no `getCoalescedEvents()`.** The Pencil samples at 240 Hz
  but you only see one sample per animation frame, so fast strokes come out as
  straight chords and the dropped samples are unrecoverable. Mitigate with
  Settings > Safari > *Prefer Page Rendering Updates near 60fps* **off**, and
  keep Low Power Mode off.

## Getting the app to run on the device at all

- **Dev has to be lowered for Safari separately from the build.** tldraw ships
  a Radix collection helper containing a class static block (`static { … }`),
  which is Safari 16.4+. An older iPad cannot *parse* the chunk and reports
  only `Unexpected token '{'`. Three traps in one:
  - `build.target` fixes the production bundle and does nothing for dev.
  - Vite 8 transforms with oxc, and oxc accepts no browser target, so neither
    `esbuild.target` nor `oxc.target` exists. The deprecated
    `optimizeDeps.esbuildOptions.target` typechecks and is silently ignored.
    The one that works is
    `optimizeDeps.rolldownOptions.transform.target: 'safari15'`.
  - The pre-bundle is cached. After changing it, delete `node_modules/.vite`
    and restart, or the stale one is served and nothing appears to change.
- **A failure in a lazily-imported chunk surfaces at the moment you navigate,
  not on load.** `DrawPage` is lazy, so a parse error in tldraw looked like
  "logging in is broken" rather than "the canvas is broken". Before it was
  lazy, the same error blanked the login screen, because tldraw had to evaluate
  before anything could paint.
- **The macOS firewall silently blocks the iPad.** `node` needs an
  allow-incoming-connections rule. If the prompt was dismissed, Safari says
  only "the URL can't be shown" and the dev server logs nothing at all.
- **`netlify serve` is not `netlify functions:serve`.** The former builds and
  serves `dist/` on 8888 and auto-opens the system browser; the latter is what
  `vite.config.ts` proxies to on 9999. Running the wrong one leaves the proxy
  answering 502 for every function call.
- **Report the status, not a guess.** `login()` originally turned any non-OK
  response into "That password is wrong", so a dead functions server was
  indistinguishable from a bad password and cost an audit of a clean `.env`.
  Only 401 now means the password was actually rejected, and a body that is not
  JSON is printed rather than reduced to "unexpected token".

## Models, prices and the effort dial

- **There is no reasoning-effort parameter for image models.** Of the 52
  image-input models, `aspect_ratio` (51) and `input_references` (51) are the
  only near-universal parameters. The effort-like ones are minorities and are
  not the same knob: `quality` (9 models, enum `auto|low|medium|high` plus
  `xhigh|max` on GPT Image 2.5) and `resolution` (19 models, enum
  `512|1K|2K|4K`). `seed` is 12, `background` 10. So one slider has to map onto
  whichever axis the chosen model has, and disable itself for those with
  neither — `effortAxis` in the catalog.
- **A slow model cannot work here at all.** Netlify's synchronous ceiling is
  60s and is not configurable. OpenRouter's own documented example has
  `openai/gpt-image-2` at `quality: high` taking **94 seconds** — it would be
  killed. This is the main reason Nano Banana 2 (~17s) is the default, and why
  the GPT family is flagged `slowAtHighEffort` and warns in the UI.
- **Advertised prices are estimates and the units differ.** Some models bill a
  flat price per image (Seedream 5 Pro, $0.045), some per megapixel (FLUX.2
  Pro, $0.03), and most per output *token* — which means cost rises with effort
  and no single number is honest. The same documented example cost **$0.13**,
  four times the token-derived estimate. The true figure arrives in
  `usage.cost` on every call, which is what the UI displays.
- **OpenRouter publishes no latency for image models.** The per-endpoint
  records carry pricing, parameters and streaming support, and no timing field
  at all. The only honest latency is measured locally, which is why every turn
  records `elapsedMs` and the bar shows a per-model mean.
- **`meta/muse-image` has zero endpoints**, so nothing serves it and it cannot
  be called, despite appearing in the model list. Check `endpoints` is
  non-empty before adding a slug to the catalog.
- **Two models are deliberately absent from the catalog.** `meta/muse-image`
  because nothing serves it, and `bytedance-seed/seedream-5-0-pro` because it
  measured **94.5s at the lowest effort** — past Netlify's ceiling however the
  slider is set, so offering it could only waste a paid slot. Both are worth
  re-testing after a provider change; `exceedsCap` exists to flag the next one.
- **Advertised prices were wrong by up to 7x in both directions.** The
  token-derived estimates put GPT Image 2.5 at $0.13 and Nano Banana 2 at
  $0.067; measured at lowest effort they are $0.0185 and $0.0454. Effort is why
  — GPT's axis is `quality` while Nano Banana's is `resolution`, so Draft on
  the latter means a literal 512px image that costs more than a 1024px one from
  the former. Run `tools/compare-models.ts` rather than trusting a number.
- **Billing is all-or-nothing.** A failed or cancelled generation is not
  billed, and returns 502 rather than a partial image. A client disconnect may
  still cost OpenRouter, but never the caller.

## Cost and limits

- **localStorage cannot hold the renders.** Two ~1 MB base64 PNGs per round
  against a ~5 MB quota fails by the third sketch. The session strip stores
  320px JPEG thumbnails; full-resolution output lives in memory only, so
  Download it or lose it on reload.
- **Netlify's synchronous limit is 60s**, not the 10s the support forums still
  discuss, and it is not configurable. Generation takes 15-20s, so it fits, and
  the function bails at 50s to return a real message instead of a 502. The
  tighter constraint is the 6 MB buffered request/response payload, which is
  why the sketch exports at `pixelRatio: 1`.
- **tldraw needs a license key in production.** It runs unlicensed on
  localhost, but on an HTTPS non-localhost domain it logs license errors. A
  hobby license is free for non-commercial use, granted at their discretion via
  a request form, and keeps a "made with tldraw" watermark you may not obscure.
  The key is validated client-side and domain-restricted, so shipping it in the
  bundle is safe and intended. Request it before the first deploy.
