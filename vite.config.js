import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isTauri = !!process.env.TAURI_BUILD || !!process.env.TAURI_ENV_PLATFORM;

// The editor is a dynamic import (so the shell paints first); preload it from the HTML
// so it downloads in parallel with the entry instead of after it.
function preloadEditor() {
  let base = '/';
  return {
    name: 'preload-editor',
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const editor = bundle && Object.values(bundle).find(c => c.moduleIds?.some(id => id.endsWith('/editor/milkdown-setup.js')));
        if (!editor) return [];
        const link = (attrs) => ({ tag: 'link', attrs, injectTo: 'head' });
        return [
          ...[editor.fileName, ...editor.imports].map(f => link({ rel: 'modulepreload', crossorigin: '', href: base + f })),
          ...[...(editor.viteMetadata?.importedCss ?? [])].map(f => link({ rel: 'preload', as: 'style', crossorigin: '', href: base + f })),
        ];
      },
    },
  };
}

export default defineConfig(() => ({
  base: isTauri ? '/' : '/mkdn/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  plugins: [
    preloadEditor(),
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
        file_handlers: [
          {
            action: './',
            accept: {
              'text/markdown': ['.md', '.markdown'],
              'text/plain': ['.txt'],
            },
          },
        ],
        categories: ['productivity', 'utilities'],
      },
    }),
  ].filter(Boolean),
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 3000,
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
}));
