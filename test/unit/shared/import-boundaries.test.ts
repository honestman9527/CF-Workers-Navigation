import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

it.each([
  ['src/shared/probe.ts', '../worker/types', false],
  ['src/shared/probe.ts', '@nav/api/client', false],
  ['src/worker/probe.ts', '../web/main', false],
  ['src/worker/probe.ts', '@/api/client', false],
  ['src/web/probe.ts', '../worker/app', false],
  ['src/web/features/navigation/probe.ts', '@nav/features/admin/AdminPage', false],
  ['src/web/features/navigation/probe.ts', '../../components/ui/button', false],
  ['src/web/features/bookmarks/useProbe.ts', '@/components/ui/button', false],
  ['src/web/features/bookmarks/useProbe.ts', '../../admin/AdminPage', false],
  ['src/worker/probe.ts', '../shared/api/types', true],
  ['src/web/features/navigation/probe.ts', '@shared/api/types', true],
] as const)('enforces import direction for %s → %s', (file, dependency, allowed) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nav-imports-'));
  try {
    copyFileSync(path.join(root, '.oxlintrc.json'), path.join(directory, '.oxlintrc.json'));
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `import '${dependency}';\n`);
    const result = spawnSync(path.join(root, 'node_modules/.bin/oxlint'), [file], {
      cwd: directory,
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(allowed ? 0 : 1);
    if (!allowed) expect(result.stdout + result.stderr).toContain('no-restricted-imports');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
