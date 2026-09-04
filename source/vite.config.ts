import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 5177, pinned, because EIGHT browser checkers and `npm run check` all default
  // to it and the README documents it as the address. Vite's own default is
  // 5173, so `npm run dev` used to serve a port nothing looked at: every browser
  // check answered ERR_CONNECTION_REFUSED against a perfectly healthy server.
  // `strictPort` is the half that matters most — without it Vite silently walks
  // to 5178 when something else holds 5177 and breaks the contract again, quietly.
  server: { port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
  // The public game is served from /convergence-card-game/play/. Relative
  // asset URLs keep audio, artwork, and fonts under that published folder.
  base: './',
  build: {
    // This project intentionally ships one main game bundle. Do not warn just
    // because that bundle crosses Vite's default 500 KB advisory threshold.
    chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
  },
})
