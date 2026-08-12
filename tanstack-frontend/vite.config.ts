import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    VitePWA({
      // Mirror of the old Next.js PWA setup: no SW in dev, API never cached.
      registerType: "autoUpdate",
      includeAssets: ["oneflow-logo.png"],
      manifest: {
        name: "OneFlow",
        short_name: "OneFlow",
        description: "Modular manufacturing ERP",
        theme_color: "#2563EB",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/dashboard",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Never cache API calls — always hit the network
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      // Mirror of the Next.js rewrite in frontend/next.config.ts
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
})

export default config
