import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const PAGES = ['index', 'studio', 'equipment', 'light', 'signin', 'signup', 'account', 'legal', '404'];

// /studio -> studio.html, the same clean addresses the hosted site uses (vercel.json cleanUrls)
const cleanUrls = () => {
  const rewrite = (req, _res, next) => {
    const m = /^\/([a-z0-9-]+)(\?.*)?$/.exec(req.url || '');
    if (m && PAGES.includes(m[1]) && m[1] !== 'index') req.url = `/${m[1]}.html${m[2] || ''}`;
    next();
  };
  return { name: 'musync-clean-urls', configureServer(s) { s.middlewares.use(rewrite); }, configurePreviewServer(s) { s.middlewares.use(rewrite); } };
};

export default defineConfig({
  root,
  plugins: [cleanUrls()],
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    port: Number(process.env.MUSYNC_UI_PORT || 5173),
    // the Musync backend (Claude director) runs on 8787
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.MUSYNC_PORT || 8787}`, changeOrigin: false } },
  },
  build: {
    target: 'es2022', outDir: fileURLToPath(new URL('../dist', import.meta.url)), emptyOutDir: true,
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p, `${root}${p}.html`])) },
  },
  worker: { format: 'es' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
