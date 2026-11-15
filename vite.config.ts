import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the same build works on GitHub Pages (/pagedock/) and locally.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'PageDock Free',
        short_name: 'PageDock',
        description: 'Free PDF tools that stay on your device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F6F8FC',
        theme_color: '#3267E8',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything the tools need, so they work with no connection after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mjs,wasm,bcmap,pfb,ttf,icc}'],
        globIgnores: ['_qa/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
