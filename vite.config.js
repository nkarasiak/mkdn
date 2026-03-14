import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isTauri = !!process.env.TAURI_BUILD || !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig(({ mode }) => ({
  base: isTauri ? '/' : '/mkdn/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __PARTYKIT_URL__: JSON.stringify(
      mode === 'development' ? 'http://localhost:1999' : 'https://mkdn-collab.nkarasiak.partykit.dev',
    ),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  plugins: [
    !isTauri && VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'MKDN — Markdown Editor',
        short_name: 'MKDN',
        description: 'A beautiful browser-based markdown editor',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',
        icons: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          milkdown: ['@milkdown/crepe', '@milkdown/utils'],
          collab: ['yjs', 'y-partykit', 'y-prosemirror'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
}));
