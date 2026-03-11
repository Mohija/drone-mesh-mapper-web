import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../manifest.json'), 'utf-8'),
);

export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(manifest.version),
  },
  server: {
    hmr: false,
    allowedHosts: ['.dasilvafelix.de'],
    proxy: {
      '/api': {
        target: 'http://localhost:3020',
        changeOrigin: true,
      },
    },
  },
});
