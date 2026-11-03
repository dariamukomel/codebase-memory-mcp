#!/usr/bin/env node
// Copies the files CI uploads when a committed generated file is stale into place:
//   fresh-blobs-<lang>      parser.c.br, node-types.json.br  ->  <lang>/src/   (base: src/)
//   fresh-inventory-<lang>  <lang>.json                       ->  tools/inventory-results/
//
//   gh run download <run-id> -D /tmp/ci && node scripts/apply-ci-artifacts.js /tmp/ci
//
// gh puts each artifact in a directory named after it. Only copies; review `git diff --stat` and commit.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = process.argv[2];
if (!from || !existsSync(from)) {
  console.error('usage: node scripts/apply-ci-artifacts.js <dir with fresh-* artifact folders>');
  process.exit(2);
}

let copied = 0;
for (const name of readdirSync(from)) {
  const dir = join(from, name);
  if (!statSync(dir).isDirectory()) continue;
  let match, dest, pick;
  if ((match = name.match(/^fresh-blobs-(.+)$/))) {
    dest = match[1] === 'base' ? join(root, 'src') : join(root, match[1], 'src');
    pick = (f) => f.endsWith('.br');
  } else if (name.startsWith('fresh-inventory-')) {
    dest = join(root, 'tools', 'inventory-results');
    pick = (f) => f.endsWith('.json');
  } else {
    continue;
  }
  for (const f of readdirSync(dir).filter(pick)) {
    copyFileSync(join(dir, f), join(dest, f));
    console.log(`${name}/${f} -> ${dest.replace(root + '/', '')}/`);
    copied++;
  }
}
console.log(`${copied} file(s) copied.`);
