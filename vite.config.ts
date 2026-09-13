import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // An Apple Pencil 1 pairs with iPads old enough to be stuck on an older
  // iPadOS, and this app has no other input device, so the oldest Safari that
  // can run it matters more than output size. This covers the production
  // bundle only: Vite 8 transforms with oxc, which takes no target, so dev
  // still serves untranspiled modern syntax. If dev works and the deployed
  // build does not, or vice versa, that asymmetry is why.
  build: { target: 'safari15' },
  server: {
    // The iPad is the only real test device, so dev has to be reachable over
    // the LAN from another machine. Pointer events need no secure context, so
    // plain HTTP to the Mac's LAN IP gives genuine Pencil input.
    host: true,
    proxy: {
      // Netlify Functions run separately on 9999 (`netlify functions:serve`).
      // Proxying keeps them same-origin with the app so the auth token in
      // localStorage is sent without CORS handling.
      '/.netlify/functions': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
    },
  },
})
