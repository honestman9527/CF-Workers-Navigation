#!/usr/bin/env node
/**
 * 生成 CI 用的 wrangler 配置：从根 wrangler.jsonc 读取并覆盖 D1 数据库标识，
 * 可选覆盖 vars，默认写出根 wrangler.ci.jsonc。
 *
 * 用法：
 *   node .github/scripts/gen-wrangler-ci.mjs \
 *     --db-name <name> --db-id <id> [--var KEY=VALUE ...] [--out <path>]
 *
 * 结构守卫：若 wrangler.jsonc 缺少必需字段（name/main/d1_databases），
 * 脚本抛错而非静默生成残缺配置。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {
    dbName: null,
    dbId: null,
    out: 'wrangler.ci.jsonc',
    vars: {},
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db-name') {
      args.dbName = argv[++i];
    } else if (a === '--db-id') {
      args.dbId = argv[++i];
    } else if (a === '--out') {
      args.out = argv[++i];
    } else if (a === '--var') {
      const pair = argv[++i];
      if (!pair || !pair.includes('=')) {
        process.stderr.write(`--var expects KEY=VALUE, got: ${pair ?? '(missing)'}\n`);
        process.exit(2);
      }
      const eq = pair.indexOf('=');
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!key) {
        process.stderr.write(`--var key must be non-empty: ${pair}\n`);
        process.exit(2);
      }
      args.vars[key] = value;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: gen-wrangler-ci.mjs --db-name <name> --db-id <id> [--var KEY=VALUE ...] [--out <path>]\n',
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${a}\n`);
      process.exit(2);
    }
  }

  if (!args.dbName || !args.dbId) {
    process.stderr.write('Missing required --db-name and --db-id\n');
    process.exit(2);
  }

  return args;
}

/** 剥离 JSONC 中的行注释与块注释，返回无注释文本。 */
function stripJsonComments(text) {
  let out = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/** 去掉 JSONC 中对象/数组的尾随逗号，返回可被 JSON.parse 解析的字符串。 */
function stripTrailingCommas(text) {
  let out = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') {
        i += 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }
  return out;
}

function parseJsonc(text) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}

function loadWranglerConfig(appRoot) {
  const configPath = resolve(appRoot, 'wrangler.jsonc');
  const raw = readFileSync(configPath, 'utf8');
  const config = parseJsonc(raw);

  const required = [
    'name',
    'main',
    'compatibility_date',
    'compatibility_flags',
    'assets',
    'd1_databases',
  ];
  const missing = required.filter((k) => config[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`wrangler.jsonc missing required fields: ${missing.join(', ')}`);
  }

  if (!Array.isArray(config.d1_databases) || config.d1_databases.length === 0) {
    throw new Error('wrangler.jsonc d1_databases must be a non-empty array');
  }

  return config;
}

function main() {
  const args = parseArgs(process.argv);
  const config = loadWranglerConfig(repositoryRoot);

  config.d1_databases = config.d1_databases.map((db) => ({
    ...db,
    database_name: args.dbName,
    database_id: args.dbId,
  }));

  const varEntries = Object.entries(args.vars);
  if (varEntries.length > 0) {
    config.vars = {
      ...config.vars,
      ...Object.fromEntries(varEntries),
    };
  }

  const outPath = resolve(repositoryRoot, args.out);
  writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`Generated ${args.out}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
