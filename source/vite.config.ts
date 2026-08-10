import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The public game is served from /convergence-card-game/play/. Relative
  // asset URLs keep audio, artwork, and fonts under that published folder.
  base: './',
})
