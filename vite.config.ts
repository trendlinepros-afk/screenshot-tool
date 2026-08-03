import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, 'overlay.html'),
        settings: resolve(__dirname, 'settings.html'),
        recorder: resolve(__dirname, 'recorder.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
