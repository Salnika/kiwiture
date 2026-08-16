import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages serves the app from `/<repo>/`. The base can be overridden at build
 * time (e.g. `VITE_BASE=/ npm run build`) for Netlify / Vercel / Cloudflare Pages,
 * which all serve from the domain root.
 */
const base = process.env.VITE_BASE ?? '/kiwiture/'

/**
 * GitHub Pages has no SPA rewrite rule: a hard refresh on `/station/FRXXX` would 404.
 * Emitting a `404.html` identical to `index.html` makes deep links work
 * (GitHub Pages serves 404.html for unknown paths, the SPA router then takes over).
 */
function spaFallbackPlugin(): Plugin {
  return {
    name: 'kiwiture-spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const out = resolve(process.cwd(), 'dist')
      const index = resolve(out, 'index.html')
      if (existsSync(index)) {
        writeFileSync(resolve(out, '404.html'), readFileSync(index))
      }
      // Disable Jekyll processing so files starting with `_` are served.
      writeFileSync(resolve(out, '.nojekyll'), '')
    },
  }
}

/**
 * Injects the deployment base path into the service worker and the manifest, and
 * the fingerprinted asset list into the service worker's precache.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'kiwiture-sw-injection',
    apply: 'build',
    closeBundle() {
      const out = resolve(process.cwd(), 'dist')

      const assetsDir = resolve(out, 'assets')
      const precache = existsSync(assetsDir)
        ? readdirSync(assetsDir)
            .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
            .map((file) => `${base}assets/${file}`)
        : []

      const manifestTarget = resolve(out, 'manifest.webmanifest')
      if (existsSync(manifestTarget)) {
        writeFileSync(
          manifestTarget,
          readFileSync(manifestTarget, 'utf8').replaceAll('__BASE__', base),
        )
      }

      const swTarget = resolve(out, 'sw.js')
      if (existsSync(swTarget)) {
        const content = readFileSync(swTarget, 'utf8')
          .replaceAll('__BASE__', base)
          .replace('__PRECACHE__', JSON.stringify(precache))
          // Cache names must change when the bundle changes, otherwise the
          // activate step would never evict the previous build's assets.
          .replaceAll('__VERSION__', createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 8))
        writeFileSync(swTarget, content)
      }
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), spaFallbackPlugin(), serviceWorkerPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react'
          return undefined
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})
