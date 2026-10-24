import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    port: Number(process.env.MUSYNC_UI_PORT || 5173),
    // the Musync backend (Claude director) runs on 8787
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.MUSYNC_PORT || 8787}`, changeOrigin: false } },
  },
  build: { target: 'es2022', outDir: fileURLToPath(new URL('../dist', import.meta.url)), emptyOutDir: true },
  worker: { format: 'es' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
