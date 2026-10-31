// 开发时 Vite 在 5173 端口，/api 转给 server.mjs（8000）；构建产物在 web/dist，由 server.mjs 托管
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' }, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
});
