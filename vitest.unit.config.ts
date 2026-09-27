import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(projectRoot, 'src/web'),
      '@nav': path.join(projectRoot, 'src/web'),
      '@nav/': path.join(projectRoot, 'src/web/'),
      '@shared': path.join(projectRoot, 'src/shared'),
    },
  },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
  },
});
