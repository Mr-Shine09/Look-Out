import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  optimizeDeps: {
    // Only scan the app entry; avoids crawling local Python venv/* .html files.
    entries: ['index.html'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
