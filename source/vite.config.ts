import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sourceDir = fileURLToPath(new URL('.', import.meta.url))
const workbookSources = new Set([
  'data/cards.csv', 'data/relics.csv', 'src/engine/types.ts',
  'scripts/card-tools.mjs', 'scripts/sync-card-workbook.mjs', '../README.md',
].map(file => path.resolve(sourceDir, file)))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'convergence-card-workbook',
    configureServer(server) {
      let pending = false
      let running = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let closed = false
      async function refresh() {
        if (running || closed) return
        running = true
        try {
          while (pending && !closed) {
            pending = false
            await new Promise<void>((resolve) => {
              const child = spawn(process.execPath, [path.join(sourceDir, 'scripts/sync-card-workbook.mjs')], { windowsHide: true, stdio: 'inherit' })
              child.once('error', (error) => { server.config.logger.error(`Card workbook refresh could not start: ${error.message}`); resolve() })
              child.once('exit', (code) => { if (code !== 0) server.config.logger.error('Card workbook refresh failed. Resolve the error above; publication remains blocked until it is current.'); resolve() })
            })
          }
        } finally { running = false }
      }
      const changed = (file: string) => {
        if (!workbookSources.has(path.resolve(file))) return
        pending = true
        clearTimeout(timer)
        timer = setTimeout(() => { void refresh() }, 350)
      }
      server.watcher.add([...workbookSources])
      server.watcher.on('change', changed).on('add', changed).on('unlink', changed)
      server.httpServer?.once('close', () => {
        closed = true; clearTimeout(timer)
        server.watcher.off('change', changed).off('add', changed).off('unlink', changed)
      })
    },
  }],
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
