#!/usr/bin/env node
/**
 * Hash-cached grammar generation.
 *
 * For the base grammar:   node scripts/generate.js
 * For a dialect grammar:  node scripts/generate.js databricks
 *
 * Each grammar generates into its own src/ directory by running
 * tree-sitter generate from within the grammar's directory.
 * This is required because tree-sitter writes output to ./src/ relative to CWD.
 */

import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Investigation-only instrumentation (GENERATE_DEBUG_MEMORY=1): some CI runs
// have died on specific dialects with "the runner has received a shutdown
// signal" (no application-level error) after a variable amount of time.
// Sampling system memory + the generate process's own RSS periodically lets
// a mid-run kill still leave a timeline behind; climbing RSS toward
// MemTotal points to a real OOM; flat/low usage points elsewhere (pure CPU
// time, or an externally-triggered interruption unrelated to this process).
function sampleMemory(label) {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const total = Number(meminfo.match(/^MemTotal:\s+(\d+) kB/m)?.[1] ?? 0);
    const avail = Number(meminfo.match(/^MemAvailable:\s+(\d+) kB/m)?.[1] ?? 0);
    const usedMb = ((total - avail) / 1024).toFixed(0);
    const totalMb = (total / 1024).toFixed(0);
    const psOut = execSync("ps -eo rss,comm --sort=-rss | grep -i tree-sitter | head -3", { encoding: 'utf8' }).trim();
    const topRss = psOut
      ? psOut.split('\n').map((l) => l.trim().split(/\s+/)).map(([rss, comm]) => `${comm}=${(Number(rss) / 1024).toFixed(0)}MB`).join(', ')
      : '(no tree-sitter process found)';
    console.log(`  [mem] ${label}: system ${usedMb}/${totalMb}MB used; ${topRss}`);
  } catch {
    // Non-Linux or /proc unavailable (e.g. local macOS dev); skip silently.
  }
}

// Resolved via $PATH rather than `npx tree-sitter` - see generate-all.js's
// CLI constant comment for why.
const CLI = 'tree-sitter';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function hashDir(dir) {
  const hash = createHash('sha256');
  function walk(p) {
    if (!existsSync(p)) return;
    for (const f of readdirSync(p).sort()) {
      const full = join(p, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.js') || f.endsWith('.c')) hash.update(readFileSync(full));
    }
  }
  walk(dir);
  return hash.digest('hex');
}

// Determine which grammar to generate.
// Argument can be a dialect name ("databricks") or omitted (base grammar).
const dialect = process.argv[2] || null;
const grammarDir = dialect ? join(ROOT, dialect) : ROOT;
const grammarFile = 'grammar.js';
const grammarPath = join(grammarDir, grammarFile);

if (!existsSync(grammarPath)) {
  console.error(`Grammar file not found: ${grammarPath}`);
  process.exit(1);
}

// Compute a hash covering the grammar entry point, the shared grammar/ rules,
// and (for dialects) the dialect's own grammar/ rules plus the full ancestor
// chain (entry file AND grammar/ rule dir of every parent grammar).
const sharedHash = hashDir(join(ROOT, 'grammar'));
const dialectHash = dialect ? hashDir(join(grammarDir, 'grammar')) : '';
const entryHash = readFileSync(grammarPath, 'utf8');

// Ancestor chains: a child grammar must regenerate when ANY file in a parent
// grammar changes; both the parent's grammar.js entry point and its
// grammar/*.js rule modules (a hive/grammar/ change flows into spark and
// databricks via grammar(base, …) composition at generation time).
const PARENTS = {
  spark: ['hive'],
  databricks: ['spark', 'hive'],
  mariadb: ['mysql'],
  athena: ['trino'],
  cockroachdb: ['postgres'],
  spanner: ['bigquery'],
};

const parentHashes = [];
for (const parent of PARENTS[dialect] || []) {
  parentHashes.push(readFileSync(join(ROOT, parent, 'grammar.js'), 'utf8'));
  parentHashes.push(hashDir(join(ROOT, parent, 'grammar')));
}

const currentHash = [sharedHash, dialectHash, entryHash, ...parentHashes].join('|');

mkdirSync(join(ROOT, '.grammar-cache'), { recursive: true });
const cacheKey = dialect || 'base';
const hashFile = join(ROOT, `.grammar-cache/${cacheKey}.hash`);

// The hash marker alone isn't proof generation actually happened: CI restores
// .grammar-cache/ and src/**/*.json/parser.c from the SAME actions/cache key,
// but if that cache entry was ever saved incomplete (e.g. a prior run whose
// upload step raced a mid-flight generate, a workflow's `path:` list missing
// one of the generated files, or GitHub's immutable-cache-key semantics
// pinning an old/partial save under this exact hash), the marker restores
// fine while some artifact it describes never does; and every future run
// with an identical grammar hash trusts the marker forever. Require every
// generated artifact `tree-sitter generate` produces to actually be on disk.
const generatedPaths = [
  join(grammarDir, 'src', 'parser.c'),
  join(grammarDir, 'src', 'grammar.json'),
  join(grammarDir, 'src', 'node-types.json'),
];
const missingPath = generatedPaths.find((p) => !existsSync(p));
const hashMatches = existsSync(hashFile) && readFileSync(hashFile, 'utf8').trim() === currentHash.trim();

if (hashMatches && !missingPath) {
  console.log(`grammar unchanged; skipping generate (${cacheKey})`);
  process.exit(0);
}
if (hashMatches) {
  console.log(`hash marker present but ${missingPath.replace(ROOT, '')} is missing; regenerating (${cacheKey})`);
}

console.log(`generating parser for ${cacheKey}...`);
// Run tree-sitter generate FROM the grammar's directory so output goes to <dialect>/src/
if (process.env.GENERATE_DEBUG_MEMORY) {
  const start = Date.now();
  sampleMemory(`${cacheKey} start`);
  const child = spawn(CLI.split(' ')[0], [...CLI.split(' ').slice(1), 'generate', grammarFile], {
    cwd: grammarDir,
    stdio: 'inherit',
  });
  const timer = setInterval(() => {
    sampleMemory(`${cacheKey} +${((Date.now() - start) / 1000).toFixed(0)}s`);
  }, 10_000);
  const code = await new Promise((res) => child.on('close', res));
  clearInterval(timer);
  sampleMemory(`${cacheKey} end (+${((Date.now() - start) / 1000).toFixed(0)}s, exit ${code})`);
  if (code !== 0) process.exit(code ?? 1);
} else {
  execSync(`${CLI} generate ${grammarFile}`, { cwd: grammarDir, stdio: 'inherit' });
}
writeFileSync(hashFile, currentHash);
console.log(`done (${cacheKey}).`);
