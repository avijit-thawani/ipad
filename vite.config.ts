import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Netlify Functions run separately on 9999 (`netlify functions:serve`).
// Proxying keeps them same-origin with the app so the auth token in
// localStorage is sent without CORS handling.
const FUNCTIONS_PROXY = {
  '/.netlify/functions': {
    target: 'http://localhost:9999',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // An Apple Pencil 1 pairs with iPads old enough to be stuck on an older
  // iPadOS, and this app has no other input device, so the oldest Safari that
  // can run it matters more than output size. This covers the production
  // bundle only: Vite 8 transforms with oxc, which takes no target, so dev
  // still serves untranspiled modern syntax. If dev works and the deployed
  // build does not, or vice versa, that asymmetry is why.
  build: { target: 'safari15' },
  // Dev serves dependencies from a pre-bundle, and tldraw's copy of a Radix
  // collection helper contains a class static block — Safari 16.4+ only. On an
  // older iPad that is a parse error, so importing the canvas fails with
  // "Unexpected token '{'" and nothing else. Lowering the pre-bundle is what
  // makes `npm run dev` usable on the device at all; app source has no such
  // syntax, and Vite 8's own transform (oxc) accepts no target.
  optimizeDeps: { rolldownOptions: { transform: { target: 'safari15' } } },
  server: {
    // The iPad is the only real test device, so dev has to be reachable over
    // the LAN from another machine. Pointer events need no secure context, so
    // plain HTTP to the Mac's LAN IP gives genuine Pencil input.
    host: true,
    proxy: FUNCTIONS_PROXY,
  },
  // `npm run dev` serves untranspiled modern syntax, because Vite 8 transforms
  // with oxc and oxc takes no browser target. `npm run preview` serves the
  // real build, which is lowered to `build.target` above — so it is the only
  // way to test on an older Safari, and the way to tell a syntax-support
  // problem apart from a genuine bug.
  preview: {
    host: true,
    proxy: FUNCTIONS_PROXY,
  },
})
