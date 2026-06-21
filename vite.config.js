import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:8000', ws: true, changeOrigin: true },
    },
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
