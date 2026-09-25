import { defineConfig } from 'vite';
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:5173; worker-src 'self' blob:; object-src 'none'; base-uri 'none'";
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: { 'Content-Security-Policy': csp },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: { 'Content-Security-Policy': csp },
  },
  build: { outDir: 'dist/demo', target: 'es2022' },
});
