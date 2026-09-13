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
