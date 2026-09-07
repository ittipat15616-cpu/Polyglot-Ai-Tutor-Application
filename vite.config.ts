import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => ({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15 MB
        navigateFallbackDenylist: [/^\/api/]
      },
      manifest: {
        name: 'Polyglot AI',
        short_name: 'PolyglotAI',
        description: 'AI Language Learning Assistant',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "."),
    },
  },
  server: {
    hmr: {
      overlay: false,
      clientPort: 443
    },
    watch: process.env.DISABLE_HMR === "true" ? null : {},
  },
}));
