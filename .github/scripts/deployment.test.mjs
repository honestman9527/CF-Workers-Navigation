import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { deploymentSha, recoveryBookmark, resolveDatabase, smokeTest } from './deployment.mjs';

const commit = 'a'.repeat(40);
const databaseId = 'abcdef12-1234-1234-1234-123456789abc';

function trustedRun() {
  return {
    eventName: 'workflow_run',
    repository: 'owner/nav',
    sha: 'b'.repeat(40),
    event: {
      workflow_run: {
        conclusion: 'success',
        event: 'push',
        head_branch: 'main',
        head_repository: { full_name: 'owner/nav' },
        head_sha: commit,
      },
    },
  };
}

test('automatic deployment selects the successful CI commit instead of the workflow SHA', () => {
  assert.equal(deploymentSha(trustedRun()), commit);
});

test('automatic deployment rejects forks, pull requests, failed CI and other branches', () => {
  for (const overrides of [
    { head_repository: { full_name: 'fork/nav' } },
    { event: 'pull_request' },
    { conclusion: 'failure' },
    { head_branch: 'feature' },
    { head_sha: 'main' },
  ]) {
    const context = trustedRun();
    Object.assign(context.event.workflow_run, overrides);
    assert.throws(() => deploymentSha(context));
  }
  const missingRepository = trustedRun();
  delete missingRepository.repository;
  delete missingRepository.event.workflow_run.head_repository;
  assert.throws(() => deploymentSha(missingRepository));
});

test('manual deployment requires main and pins the dispatch SHA', () => {
  const context = {
    eventName: 'workflow_dispatch',
    event: {},
    ref: 'refs/heads/main',
    sha: commit,
  };
  assert.equal(deploymentSha(context), commit);
  assert.throws(() => deploymentSha({ ...context, ref: 'refs/heads/feature' }));
  assert.throws(() => deploymentSha({ ...context, sha: 'main' }));
});

test('D1 resolution requires a unique existing target with matching name and optional ID', () => {
  const databases = [{ name: 'nav', uuid: databaseId }];
  assert.deepEqual(resolveDatabase(databases, 'nav'), { name: 'nav', id: databaseId });
  assert.deepEqual(resolveDatabase(databases, 'nav', databaseId), { name: 'nav', id: databaseId });
  assert.throws(() => resolveDatabase(databases, 'typo'));
  assert.throws(() => resolveDatabase(databases, 'nav', 'mismatched-id'));
  assert.throws(() => resolveDatabase([...databases, ...databases], 'nav'));
  assert.throws(() => resolveDatabase([{ name: 'nav', uuid: 'invalid' }], 'nav'));
  assert.throws(() =>
    resolveDatabase([{ name: 'nav', uuid: '00000000-0000-0000-0000-000000000000' }], 'nav'),
  );
});

test('recovery requires an actual bookmark before migrations proceed', () => {
  assert.equal(
    recoveryBookmark({ bookmark: '00000085-0000024c-00004c6d-abcdef' }),
    '00000085-0000024c-00004c6d-abcdef',
  );
  for (const info of [null, {}, { bookmark: '' }, { bookmark: 123 }, { bookmark: 'bad\noutput' }]) {
    assert.throws(() => recoveryBookmark(info));
  }
});

test('smoke checks health and performs an unauthenticated public D1 read, including empty databases', async () => {
  const paths = [];
  await smokeTest('https://nav.example', async (url, options) => {
    paths.push(`${url.pathname}${url.search}`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return Response.json(
      url.pathname === '/health' ? { ok: true } : { items: [], nextCursor: null },
    );
  });
  assert.deepEqual(paths, ['/health', '/api/v1/bookmarks?limit=1']);
});

test('smoke fails on an HTML fallback, D1 error or private data response', async () => {
  for (const failure of [
    () => new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => Response.json({ error: 'D1 unavailable' }, { status: 500 }),
    () => Response.json({ items: [{ effectiveVisibility: 'private' }], nextCursor: null }),
    () => Response.json({ items: [] }),
  ]) {
    await assert.rejects(
      smokeTest('https://nav.example', async (url) =>
        url.pathname === '/health' ? Response.json({ ok: true }) : failure(),
      ),
    );
  }
  await assert.rejects(smokeTest('https://nav.example', async () => Response.json({ ok: false })));
});

test('smoke rejects ambiguous URLs before sending a request', async () => {
  for (const siteUrl of [
    'https://user:password@nav.example',
    'https://nav.example/path',
    'https://nav.example?key=value',
    'file:///tmp/site',
  ]) {
    await assert.rejects(smokeTest(siteUrl, () => assert.fail('Unexpected request')));
  }
});

test('unconfigured smoke CLI reports pending manual verification without claiming success', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nav-deployment-'));
  try {
    const summaryPath = join(directory, 'summary.md');
    const result = spawnSync(process.execPath, ['.github/scripts/deployment.mjs', 'smoke'], {
      env: { ...process.env, SITE_URL: '', GITHUB_STEP_SUMMARY: summaryPath },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const summary = readFileSync(summaryPath, 'utf8');
    assert.match(summary, /Pending manual verification/);
    assert.doesNotMatch(summary, /Passed/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
