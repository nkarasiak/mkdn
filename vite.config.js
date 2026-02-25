import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mkdn/',
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
});
