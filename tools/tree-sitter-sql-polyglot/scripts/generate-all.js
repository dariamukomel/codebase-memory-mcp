#!/usr/bin/env node
/**
 * Parallel wrapper around generate.js.
 *
 * Usage:
 *   node scripts/generate-all.js                # base + all 22 dialects
 *   node scripts/generate-all.js hive spark ...  # only the named dialects
 *
 * Each dialect's grammar.js imports its parent's grammar.js SOURCE module
 * directly (e.g. spark/grammar.js does `import hive from '../hive/grammar.js'`)
 * and composes the merged grammar in-process before calling `tree-sitter
 * generate`; it never reads the parent's compiled src/parser.c. So there is
 * no ordering dependency between dialects at generation time, and running
 * `node scripts/generate.js <dialect>` for every dialect concurrently is
 * safe: each is an independent process reading only source files and
 * writing only to its own <dialect>/src/.
 */

import { execSync, spawn } from 'child_process';
import { cpus, totalmem } from 'os';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Must match the CLI constant in generate.js. Resolved via $PATH (the CI
// runner's tree-sitter/setup-action, or a contributor's local/global
// install) rather than `npx tree-sitter`: npx has no local node_modules
// install to find in CI, and its on-demand fetch-and-cache resolution of a
// package.json-declared devDependency (what made bare `npx tree-sitter`
// work before) is no longer reliable across npm versions. Verify it
// resolves once, serially, before starting the concurrent worker pool below,
// so a missing/broken CLI fails fast with one clear error instead of N.
const CLI = 'tree-sitter';
try {
  execSync(`${CLI} --version`, { cwd: ROOT, stdio: 'ignore' });
} catch {
  // Ignore; if the CLI is genuinely broken, the failure surfaces per-dialect
  // below where it can be attributed to a specific grammar.
}

const DEFAULT_ALL = [
  'base', 'spark', 'postgres', 'mysql', 'databricks', 'snowflake', 'bigquery',
  'mariadb', 'sqlite', 'hive', 'oracle', 'db2', 'tsql', 'duckdb', 'trino',
  'athena', 'redshift', 'clickhouse', 'flink', 'cockroachdb', 'spanner',
  'teradata', 'hana',
];

const names = process.argv.slice(2);
const targets = names.length ? names : DEFAULT_ALL;

// tree-sitter generate's LR table construction is memory-hungry for the
// larger/more conflict-heavy dialects (spark, databricks, oracle measured
// locally at 2.5-5.5GB RSS each while generating). CPU-count concurrency
// (4 on a standard GitHub-hosted runner, which also has ~16GB RAM) let 3-4
// such processes run at once and exceed the runner's memory budget; the
// OOM took down the whole runner VM rather than just the offending
// process, which surfaces in Actions as "the runner has received a
// shutdown signal" instead of an ordinary failed step. Budget conservatively
// (6GB/worker) against total system memory, capped by CPU count.
const memoryBoundConcurrency = Math.floor(totalmem() / (6 * 1024 ** 3));
const concurrency = Math.max(
  1,
  Number(process.env.GENERATE_CONCURRENCY) || Math.min(cpus().length, memoryBoundConcurrency),
);

function generateOne(name) {
  const args = name === 'base' ? [] : [name];
  return new Promise((resolve) => {
    const child = spawn('node', ['scripts/generate.js', ...args], { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => {
      process.stdout.write(`::group::generate (${name})\n${output}::endgroup::\n`);
      resolve(code === 0);
    });
  });
}

async function runPool(items, limit) {
  let index = 0;
  let ok = true;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      if (!(await generateOne(item))) ok = false;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ok;
}

const start = Date.now();
const success = await runPool(targets, concurrency);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`generate-all: ${targets.length} grammar(s) in ${elapsed}s (concurrency=${concurrency})`);

if (!success) {
  console.error('generate-all: one or more grammars failed to generate');
  process.exit(1);
}
