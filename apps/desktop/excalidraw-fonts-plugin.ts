import { cp } from 'node:fs/promises'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { EXCALIDRAW_ASSET_URL_PATH } from './src/drawing/excalidraw-asset-path'

const FONTS_URL_PREFIX = `${EXCALIDRAW_ASSET_URL_PATH}fonts/`

const fontsSourceDir = fileURLToPath(
  new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url),
)

/**
 * Bundles Excalidraw's fonts into the app so the canvas never phones home:
 * without a reachable `EXCALIDRAW_ASSET_PATH`, Excalidraw falls back to
 * fetching fonts from a CDN (esm.sh), which DayJot's no-external-services
 * principle forbids. Dev serves the font files straight out of
 * `node_modules`; a production build copies them into
 * `dist/excalidraw/fonts/` next to the Vite output.
 */
export function excalidrawFonts(): Plugin {
  return {
    name: 'dayjot:excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0] ?? ''
        if (!url.startsWith(FONTS_URL_PREFIX)) {
          next()
          return
        }
        // Resolve against the fonts dir and re-check containment so an
        // encoded `..` in the URL can never escape into node_modules.
        const relative = normalize(decodeURIComponent(url.slice(FONTS_URL_PREFIX.length)))
        const file = resolve(join(fontsSourceDir, relative))
        if (!file.startsWith(fontsSourceDir) || !existsSync(file) || !statSync(file).isFile()) {
          response.statusCode = 404
          response.end()
          return
        }
        response.setHeader('Content-Type', 'font/woff2')
        createReadStream(file).pipe(response)
      })
    },
    async writeBundle(options) {
      const outDir = options.dir
      if (outDir === undefined) {
        return
      }
      await cp(fontsSourceDir, join(outDir, 'excalidraw', 'fonts'), { recursive: true })
    },
  }
}
