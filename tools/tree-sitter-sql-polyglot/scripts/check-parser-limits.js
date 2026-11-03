#!/usr/bin/env node
/* Inspect generated artifacts without regenerating them.  Field-only grammar
 * changes cannot add LR states/actions, but syntax changes (including dynamic
 * identifiers) must be measured from parser.c before the blobs are committed. */

import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALL = [
  'base', 'postgres', 'cockroachdb', 'mysql', 'mariadb', 'sqlite', 'oracle',
  'db2', 'tsql', 'hana', 'teradata', 'bigquery', 'spanner', 'snowflake',
  'redshift', 'duckdb', 'clickhouse', 'trino', 'athena', 'flink', 'hive',
  'spark', 'databricks',
];
const requested = process.argv.slice(2);
const targets = requested.length ? requested : ALL;
let failed = false;

async function inspect(name) {
  const parser = join(name === 'base' ? ROOT : join(ROOT, name), 'src', 'parser.c');
  if (!existsSync(parser)) return { name, parser, missing: true };
  let states = null, largeStates = null, maxActions = 0, overflows = 0;
  const lines = createInterface({ input: createReadStream(parser), crlfDelay: Infinity });
  for await (const line of lines) {
    let match = line.match(/^#define STATE_COUNT (\d+)/);
    if (match) states = Number(match[1]);
    match = line.match(/^#define LARGE_STATE_COUNT (\d+)/);
    if (match) largeStates = Number(match[1]);
    for (const action of line.matchAll(/\bACTIONS\((\d+)\)/g)) {
      const id = Number(action[1]);
      maxActions = Math.max(maxActions, id);
      if (id > 65535) overflows++;
    }
  }
  return { name, parser, states, largeStates, maxActions, overflows };
}

console.log('dialect\tstates\tlarge_states\tmax_actions\tstatus');
for (const target of targets) {
  const result = await inspect(target);
  const invalid = result.missing || result.states === null || result.maxActions === 0 ||
                  result.states > 65536 || result.overflows > 0;
  failed ||= invalid;
  console.log([
    result.name,
    result.missing ? '-' : result.states,
    result.missing ? '-' : result.largeStates,
    result.missing ? '-' : result.maxActions,
    result.missing ? 'MISSING' : invalid ? 'OVERFLOW' : 'ok',
  ].join('\t'));
}
console.log('limits: states <= 65536, ACTIONS(id) <= 65535');
if (failed) process.exitCode = 1;
