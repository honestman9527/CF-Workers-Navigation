import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const shaPattern = /^[a-f\d]{40}$/i;
const databaseIdPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

export function deploymentSha({ eventName, event, ref, sha, repository }) {
  let target;
  if (eventName === 'workflow_dispatch' && ref === 'refs/heads/main') {
    target = sha;
  } else if (eventName === 'workflow_run') {
    const run = event.workflow_run;
    if (
      run?.conclusion === 'success' &&
      run.event === 'push' &&
      run.head_branch === 'main' &&
      typeof repository === 'string' &&
      repository.length > 0 &&
      run.head_repository?.full_name === repository
    ) {
      target = run.head_sha;
    }
  }
  if (!shaPattern.test(target ?? '')) {
    throw new Error(
      'Deployment requires a successful main push from this repository or a main dispatch.',
    );
  }
  return target;
}

export function resolveDatabase(databases, name, id = '') {
  if (!Array.isArray(databases) || typeof name !== 'string' || !name) {
    throw new Error('Expected a D1 database list and non-empty NAME.');
  }
  const matches = databases.filter((database) => {
    const databaseName = database.name ?? database.database_name;
    const databaseId = database.uuid ?? database.id ?? database.database_id;
    return databaseName === name && (!id || databaseId === id);
  });
  const databaseId = matches[0]?.uuid ?? matches[0]?.id ?? matches[0]?.database_id;
  if (
    matches.length !== 1 ||
    !databaseIdPattern.test(databaseId ?? '') ||
    databaseId === '00000000-0000-0000-0000-000000000000'
  ) {
    throw new Error(
      'D1 target not found or ambiguous. Create it explicitly and verify NAME and D1_DATABASE_ID.',
    );
  }
  return { name, id: databaseId };
}

export function recoveryBookmark(info) {
  if (typeof info?.bookmark !== 'string' || !/^[a-z\d-]+$/i.test(info.bookmark)) {
    throw new Error('D1 did not return a valid recovery bookmark; stopping before migrations.');
  }
  return info.bookmark;
}

export async function smokeTest(siteUrl, fetcher = fetch) {
  const base = new URL(siteUrl);
  if (
    !['https:', 'http:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  ) {
    throw new Error(
      'SITE_URL must be the public site origin without credentials, path, query or fragment.',
    );
  }
  for (const path of ['/health', '/api/v1/bookmarks?limit=1']) {
    const response = await fetcher(new URL(path, base), {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`Smoke check failed: ${path} did not return successful JSON.`);
    }
    const data = await response.json();
    if (path === '/health') {
      if (data?.ok !== true) throw new Error('Smoke check failed: invalid health response.');
    } else if (
      !Array.isArray(data?.items) ||
      data.items.length > 1 ||
      !(data.nextCursor === null || typeof data.nextCursor === 'string') ||
      data.items.some((item) => item?.effectiveVisibility !== 'public')
    ) {
      throw new Error('Smoke check failed: invalid public D1 bookmark response.');
    }
  }
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  } else {
    process.stdout.write(`${text}\n`);
  }
}

async function main() {
  const [action, inputPath] = process.argv.slice(2);
  if (action === 'target') {
    const commit = deploymentSha({
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
      repository: process.env.GITHUB_REPOSITORY,
    });
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
    appendFileSync(process.env.GITHUB_OUTPUT, `commit_sha=${commit}\n`);
    summary(`## Deployment\n\nCommit: \`${commit}\``);
  } else if (action === 'database') {
    const database = resolveDatabase(
      JSON.parse(readFileSync(inputPath, 'utf8')),
      process.env.NAME,
      process.env.D1_DATABASE_ID,
    );
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `database_name=${database.name}\ndatabase_id=${database.id}\n`,
    );
  } else if (action === 'recovery') {
    const bookmark = recoveryBookmark(JSON.parse(readFileSync(inputPath, 'utf8')));
    const config = JSON.parse(readFileSync('wrangler.ci.jsonc', 'utf8'));
    const database = config.d1_databases.find((entry) => entry.binding === 'DB');
    summary(
      `\n## D1 recovery point\n\nRecorded at: ${new Date().toISOString()}\n\n` +
        `Worker: \`${config.name}\`\n\nDatabase: \`${database.database_name}\` ` +
        `(\`${database.database_id}\`)\n\nCommit: \`${process.env.DEPLOYMENT_SHA}\`\n\n` +
        `Bookmark before migration tracking or application: \`${bookmark}\`\n\n` +
        'A database restore also rewinds writes made after this point. See docs/deployment.md before restoring.',
    );
  } else if (action === 'migrations') {
    const output = readFileSync(inputPath, 'utf8');
    if (!output.trim()) throw new Error('Missing D1 migration inventory.');
    summary(`\n## Pending D1 migrations\n\n\`\`\`text\n${output.replaceAll('```', '')}\n\`\`\``);
  } else if (action === 'smoke') {
    if (!process.env.SITE_URL) {
      summary(
        '\n## Public smoke check\n\n**Pending manual verification:** SITE_URL is not configured. Verify /health and /api/v1/bookmarks?limit=1 after deployment.',
      );
      process.stdout.write(
        'SITE_URL is not configured; public smoke checks require manual verification.\n',
      );
      return;
    }
    try {
      await smokeTest(process.env.SITE_URL);
      summary(
        '\n## Public smoke check\n\nPassed: /health and unauthenticated /api/v1/bookmarks?limit=1 (D1 read).',
      );
    } catch (error) {
      summary(
        '\n## Public smoke check\n\n**Failed:** inspect the deployment and D1 compatibility before retrying. No automatic rollback was performed.',
      );
      throw error;
    }
  } else {
    throw new Error('Expected target, database, recovery, migrations or smoke action.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
