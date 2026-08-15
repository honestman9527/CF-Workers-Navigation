import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ext': path.join(projectRoot, 'src/extension'),
      '@shared': path.join(projectRoot, 'src/shared'),
    },
  },
  test: {
    include: ['src/extension/**/*.test.ts', 'src/shared/**/*.test.ts', 'src/web/**/*.test.ts'],
  },
});
