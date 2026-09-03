import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.join(projectRoot, 'src/shared'),
    },
  },
  test: {
    include: ['src/shared/**/*.test.ts', 'src/web/**/*.test.ts'],
  },
});
