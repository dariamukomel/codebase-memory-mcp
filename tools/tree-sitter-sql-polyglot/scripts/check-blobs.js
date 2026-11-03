#!/usr/bin/env node
/**
 * Fails when a committed parser.c.br / node-types.json.br no longer matches the file the
 * grammar currently generates. Run after `tree-sitter generate`:
 *
 *   node scripts/check-blobs.js base
 *   node scripts/check-blobs.js snowflake
 *
 * Decompresses the committed blob and compares bytes, so it does not depend on the Brotli
 * encoder producing identical output on every machine.
 */

import { brotliDecompressSync } from 'zlib';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let stale = false;

for (const name of process.argv.slice(2)) {
  const dir = name === 'base' ? ROOT : join(ROOT, name);
  for (const file of ['parser.c', 'node-types.json']) {
    const generated = join(dir, 'src', file);
    const blob = `${generated}.br`;
    if (!existsSync(generated) || !existsSync(blob)) {
      console.error(`${name}/${file}: missing ${existsSync(generated) ? 'blob' : 'generated file'}`);
      stale = true;
      continue;
    }
    const same = brotliDecompressSync(readFileSync(blob)).equals(readFileSync(generated));
    console.log(`${name}/${file}: ${same ? 'blob is current' : 'BLOB IS STALE'}`);
    if (!same) stale = true;
  }
}

if (stale) {
  console.error('\nRun `node scripts/compress-parsers.js <grammar>` after regenerating and commit the .br files.');
  process.exit(1);
}
