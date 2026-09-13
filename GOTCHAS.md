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

## Browser APIs that quietly do nothing

- **`crypto.randomUUID` needs a secure context**, and LAN dev is plain HTTP, so
  on the iPad it is simply `undefined`. It threw *after* a paid render was on
  screen and before the round was recorded, losing it. `getRandomValues` has no
  such restriction and is what ids come from now.
- **`.safe-bottom` beat every `pb-*` utility**, because it is declared after
  Tailwind and both are single-class selectors — and its
  `env(safe-area-inset-bottom)` is **0** on an iPad with no home indicator. So
  padding that looked present was silently zeroed and the bar sat flush against
  the glass. It is now `max(1rem, env(...))`.
- **tldraw opens in the `select` tool**, not `draw`. The pen button looked
  chosen while taps only selected. Set the tool explicitly on mount rather than
  relying on a default that is a version detail.
- **Emoji can fall back to a monochrome text glyph.** `🖊` (U+1F58A) does;
  `✒️` (U+2712 FE0F) has emoji presentation everywhere. Obscure glyphs like the
  dotted square risk a tofu box, so prefer plain text for anything load-bearing.
- **There is no pale-blue disc emoji.** That is why the palette is eight
  colours rather than tldraw's thirteen: two options showing the same disc is
  worse than not offering the shade.

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
  killed. Measured latency is why the default is a fast model, and why the GPT
  family is flagged `slowAtHighEffort` and warns in the UI past Normal.
- **Billing units differ per model**, so no single number is honest: flat per
  image (Seedream, $0.045), per megapixel (FLUX.2 Pro, $0.03), or per output
  *token* for most — which means cost rises with effort. `usage.cost` on each
  call is the only true figure.
- **OpenRouter publishes no latency for image models.** The per-endpoint
  records carry pricing, parameters and streaming support, and no timing field
  at all. The only honest latency is measured locally, which is why every turn
  appends model, seconds, cost, effort, style and aspect to
  `renders/log.jsonl` — append-only, so it outlives a server restart. The app
  shows none of it: it is for drawing, not for reading statistics.
- **Two models are deliberately absent from the catalog.** `meta/muse-image`
  because nothing serves it, and `bytedance-seed/seedream-5-0-pro` because it
  measured **94.5s at the lowest effort** — past Netlify's ceiling however the
  slider is set, so offering it could only waste a paid slot. Both are worth
  re-testing after a provider change; `exceedsCap` exists to flag the next one.
- **Advertised prices were wrong by up to 7x in both directions.** The
  token-derived estimates put GPT Image 2.5 at $0.13 and Nano Banana 2 at
  $0.067; measured at lowest effort they are $0.0185 and $0.0454. Effort is why
  — GPT's axis is `quality` while Nano Banana's is `resolution`, so Draft on
  the latter means a literal 512px image costing *more* than a 1024px one from
  the former. Run `tools/compare-models.ts` rather than trusting a number.
- **Three of the eight models return JPEG, not PNG.** Reading a JPEG as though
  it had a PNG `IHDR` chunk yields sizes like 65536x4293722192, so sniff the
  magic bytes and read `media_type` rather than assuming the format.
- **Billing is all-or-nothing.** A failed or cancelled generation is not
  billed, and returns 502 rather than a partial image. A client disconnect may
  still cost OpenRouter, but never the caller.

## Cost and limits

- **localStorage cannot hold the renders.** Two ~1 MB base64 PNGs per round
  against a ~5 MB quota fails by the third sketch, so the history strip stores
  320px JPEG thumbnails. IndexedDB has no such limit, which is where the latest
  render is cached full-size (`src/lib/lastRender.ts`) — otherwise a reload
  brought the sketch back but not the render, since tldraw persists its own.
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
