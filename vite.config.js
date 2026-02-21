import { defineConfig } from 'vite';

export default defineConfig({
  base: '/downtomark/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 3000,
  },
});
