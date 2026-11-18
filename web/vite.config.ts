import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 直接从 music.config.json 读端口，改配置不用改这里 */
function apiPort(): number {
  try {
    const raw = fs.readFileSync(fileURLToPath(new URL('../music.config.json', import.meta.url)), 'utf8');
    return Number(JSON.parse(raw).port) || 3001;
  } catch {
    return 3001;
  }
}

const port = apiPort();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    // 允许读取仓库根目录下的 shared/types.ts
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${port}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
