/**
 * Generates the service worker with workbox-build after `vite build`.
 * vite-plugin-pwa cannot emit sw.js under TanStack Start (the top-level
 * build is the SSR build; the client build is internal to the Start plugin),
 * so the SW is generated here against the static client output.
 */
import { generateSW } from "workbox-build"
import { fileURLToPath } from "node:url"
import path from "node:path"

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/client")

await generateSW({
  globDirectory: clientDir,
  globPatterns: ["**/*.{js,css,html,png,ico,svg,webmanifest}"],
  globIgnores: ["**/sw.js", "**/workbox-*.js"],
  swDest: path.join(clientDir, "sw.js"),
  clientsClaim: true,
  skipWaiting: true,
  cleanupOutdatedCaches: true,
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  runtimeCaching: [
    {
      // Never cache API calls — always hit the network
      urlPattern: /^\/api\//,
      handler: "NetworkOnly",
    },
  ],
})

console.log("[build-sw] service worker generated at dist/client/sw.js")
