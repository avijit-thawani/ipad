import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
