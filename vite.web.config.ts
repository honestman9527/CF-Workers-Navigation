import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(projectRoot, 'src/web');

export default defineConfig({
  root: webRoot,
  publicDir: path.join(projectRoot, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': webRoot,
      '@nav': webRoot,
      '@shared': path.join(projectRoot, 'src/shared'),
    },
  },
  build: {
    outDir: path.join(projectRoot, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
