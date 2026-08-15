#!/usr/bin/env node
/**
 * 将 dist/extension 内容打包为 Chrome 可加载 / 上传的 zip。
 *
 * - zip 根目录即为扩展根（manifest.json 在顶层，不含 extension/ 外壳目录）
 * - 跳过隐藏文件与常见系统垃圾（.DS_Store、Thumbs.db 等）
 * - 使用 DEFLATE，无第三方依赖
 *
 * 用法：
 *   node scripts/pack-extension.mjs
 *   node scripts/pack-extension.mjs --out dist/custom.zip
 *   pnpm bundle   # 先 build 再打包
 */

import { createWriteStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '__MACOSX']);

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') {
      args.out = argv[++i];
      if (!args.out) {
        throw new Error('--out 需要路径参数');
      }
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: pack-extension.mjs [--out <path>]\n' +
          '  Packs dist/extension into a Chrome extension zip.\n',
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${a}`);
    }
  }
  return args;
}

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_NAMES.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, acc);
    } else if (st.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

/** CRC-32（ZIP 所需） */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

/**
 * 将文件列表写入 ZIP（DEFLATE）。
 * entries: { name: posix path in zip, data: Buffer }[]
 */
async function writeZip(outPath, entries) {
  const stream = createWriteStream(outPath);
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const method = 8; // DEFLATE
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(method),
      u16(0), // time
      u16(0), // date
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0), // extra
      nameBuf,
    ]);

    stream.write(localHeader);
    stream.write(compressed);

    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed
        u16(0),
        u16(method),
        u16(0),
        u16(0),
        u32(crc),
        u32(compressed.length),
        u32(data.length),
        u16(nameBuf.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk start
        u16(0), // int attr
        u32(0), // ext attr
        u32(offset),
        nameBuf,
      ]),
    );

    offset += localHeader.length + compressed.length;
  }

  const centralDir = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  stream.write(centralDir);
  stream.write(end);
  stream.end();
  await finished(stream);
}

function toZipPath(file, root) {
  return relative(root, file).split(sep).join('/');
}

async function main() {
  const args = parseArgs(process.argv);
  const extDir = resolve(projectRoot, 'dist/extension');
  const manifestPath = join(extDir, 'manifest.json');

  if (!existsSync(extDir) || !existsSync(manifestPath)) {
    process.stderr.write('未找到 dist/extension/manifest.json。请先运行：pnpm build:extension\n');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = manifest.version || '0.0.0';
  const defaultOut = resolve(projectRoot, 'dist', `nav-extension-${version}.zip`);
  const outPath = resolve(projectRoot, args.out || defaultOut);

  const files = walkFiles(extDir).sort((a, b) =>
    toZipPath(a, extDir).localeCompare(toZipPath(b, extDir)),
  );

  if (files.length === 0) {
    process.stderr.write('dist/extension 为空，无法打包。\n');
    process.exit(1);
  }

  const entries = files.map((file) => ({
    name: toZipPath(file, extDir),
    data: readFileSync(file),
  }));

  await writeZip(outPath, entries);

  const sizeKb = (statSync(outPath).size / 1024).toFixed(1);
  process.stdout.write(
    `已打包 ${files.length} 个文件 → ${relative(projectRoot, outPath)} (${sizeKb} KB)\n` +
      `Chrome：chrome://extensions → 加载已解压的扩展目录，或上传该 zip 到开发者后台。\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
