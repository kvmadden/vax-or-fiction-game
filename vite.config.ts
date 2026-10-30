import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import type { Server as HttpServer } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The build stamps its commit on <html data-build-sha>. Outside a git checkout (a tarball, a copy) it falls back
// to VOF_BUILD_SHA or "local" instead of failing the build.
function resolveBuildSha(): string {
  if (process.env.VOF_BUILD_SHA) return process.env.VOF_BUILD_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'local'
  }
}
const buildSha = resolveBuildSha()

function roomRelay(): Plugin {
  return {
    name: 'vof-room-relay',
    apply: 'serve',
    async configureServer(server) {
      if (!server.httpServer) return
      const { attachRoomRelay } = await import('./server/room-relay.mjs')
      const relay = attachRoomRelay(server.httpServer as HttpServer)
      server.httpServer.once('close', () => { void relay.close() })
    },
  }
}

function artifactIdentity(): Plugin {
  return {
    name: 'vof-artifact-identity',
    transformIndexHtml(html) {
      return html.replace('<html', `<html data-build-sha="${buildSha}"`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    roomRelay(),
    artifactIdentity(),
  ],
  build: {
    target: 'es2022',
    // TW-7: tests/integration/remote-cue-isolation.test.mjs builds the phone's real chunk set from
    // this (dist/.vite/manifest.json) instead of sniffing each built file's text for markers that
    // could miss a shared chunk the phone also loads (the entry chunk, or one it imports statically
    // that happens not to carry any of those literal marker strings itself).
    // MANIFEST (round 7): that manifest names every source module path (16 of them, Admin.tsx
    // included), so shipping it unconditionally put a map of the app's internal structure in the
    // production artifact for no runtime reason. `npm run check`'s build step sets
    // VOF_BUILD_MANIFEST=1 for exactly this one build (package.json scripts.check), so
    // remote-cue-isolation still gets its manifest there. A plain `npm run build` does not.
    manifest: process.env.VOF_BUILD_MANIFEST === '1',
    rollupOptions: {
      // 404.html (VOF-45 fix pass) is a second real HTML entry, not a copied public/ file, so it
      // gets the same processing index.html does: its <link rel="stylesheet"> is resolved,
      // hashed and bundled through the real CSS pipeline, and artifactIdentity's
      // transformIndexHtml hook (below) stamps data-build-sha on it too. Vite mirrors an HTML
      // input's own relative path in the output, so this still lands at dist/404.html, exactly
      // where Vercel's static routing looks for it.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  server: {
    host: true,
    // Phones on a LAN reach the dev server by IP. Add a tunnel host here if you use one.
    allowedHosts: ['localhost'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
