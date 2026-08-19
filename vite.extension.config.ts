import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crx } from '@crxjs/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import manifest from './src/extension/manifest';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.join(projectRoot, 'src/extension');

export default defineConfig({
  root: extensionRoot,
  publicDir: path.join(projectRoot, 'public'),
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), crx({ manifest })],
  resolve: {
    alias: {
      '@ext': extensionRoot,
      '@shared': path.join(projectRoot, 'src/shared'),
    },
  },
  build: {
    outDir: path.join(projectRoot, 'dist/extension'),
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
