import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: '/mkdn/',
  define: {
    __PARTYKIT_URL__: JSON.stringify(
      mode === 'development' ? 'http://localhost:1999' : '',
    ),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
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
