import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE_FILE=1 produces a self-contained dist/index.html (JS + CSS inlined)
// that runs by double-clicking it, with no server. Otherwise a normal,
// relative-path build is produced (portable on any static host / subpath).
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  // Relative base so the build works from file://, a subfolder, or any host.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: singleFile ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    sourcemap: !singleFile,
    chunkSizeWarningLimit: 1600,
    rollupOptions: singleFile
      ? {}
      : {
          output: {
            manualChunks: {
              three: ['three'],
            },
          },
        },
  },
  server: {
    port: 5173,
    host: true,
  },
});
