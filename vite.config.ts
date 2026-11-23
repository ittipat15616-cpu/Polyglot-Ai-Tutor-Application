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
  worker: {
    format: 'es' as const,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
            if (id.includes('pdfjs-dist') || id.includes('react-pdf')) return 'vendor-pdf';
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
            if (id.includes('konva') || id.includes('hanzi-writer')) return 'vendor-canvas';
            if (id.includes('lucide-react') || id.includes('framer-motion') || id.includes('/motion/')) return 'vendor-ui';
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
          }
          if (id.includes('/src/data/hsk7to9Data') || id.includes('/src/data/hsk6Data')) return 'data-hsk-adv';
          if (id.includes('/src/data/hsk')) return 'data-hsk-core';
          if (id.includes('/src/data/voa_lessons') || id.includes('/src/data/cefrVocab') || id.includes('/src/data/ielts')) return 'data-en';
        },
      },
    },
  },
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
