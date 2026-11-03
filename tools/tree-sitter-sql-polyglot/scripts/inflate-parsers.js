#!/usr/bin/env node
/**
 * Build-time counterpart to scripts/compress-parsers.js: decompresses each
 * committed parser.c.br/node-types.json.br blob back into a real file, using
 * Node's built-in zlib. Runs on install/build for Node, Go and Swift so none
 * of them need a full `tree-sitter generate` pass. Skips files already newer
 * than their .br. Also writes each dialect's highlights.bundled.scm (see
 * scripts/bundle-highlights.js).
 */

import { brotliDecompressSync } from 'zlib';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DIALECT_DIRS = [
  'spark', 'postgres', 'mysql', 'databricks', 'snowflake', 'bigquery',
  'mariadb', 'sqlite', 'hive', 'oracle', 'db2', 'tsql', 'duckdb', 'trino',
  'athena', 'redshift', 'clickhouse', 'flink', 'cockroachdb', 'spanner',
  'teradata', 'hana',
];

const FILES = ['parser.c', 'node-types.json'];

let failed = false;

for (const name of ['base', ...DIALECT_DIRS]) {
  const dir = name === 'base' ? ROOT : join(ROOT, name);

  for (const file of FILES) {
    const outPath = join(dir, 'src', file);
    const blobPath = `${outPath}.br`;

    if (!existsSync(blobPath)) {
      console.error(`${name}/${file}: missing ${blobPath.replace(ROOT, '')}`);
      failed = true;
      continue;
    }

    if (existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(blobPath).mtimeMs) {
      continue; // already inflated and up to date
    }

    mkdirSync(dirname(outPath), { recursive: true });
    const inflated = brotliDecompressSync(readFileSync(blobPath));
    writeFileSync(outPath, inflated);
  }
}

if (failed) {
  console.error('inflate-parsers: one or more .br blobs are missing');
  process.exit(1);
}

// The per-dialect highlights.bundled.scm files are generated from the
// hand-written queries plus node-types.json, and gitignored the same way.
// An installed npm package has no sources and ships them prebuilt instead.
const { hasSources, writeBundles } = await import('./bundle-highlights.js');
if (hasSources()) writeBundles();
