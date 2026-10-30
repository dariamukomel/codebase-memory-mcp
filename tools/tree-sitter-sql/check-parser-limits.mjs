// Checks an existing artifact; this does not predict a changed grammar's tables.
import fs from 'node:fs';
import readline from 'node:readline';

const path = process.argv[2] ?? new URL('./src/parser.c', import.meta.url);
let maxActions = 0, overflowOccurrences = 0, states = null;
for await (const line of readline.createInterface({
  input: fs.createReadStream(path), crlfDelay: Infinity,
})) {
  const count = line.match(/^#define STATE_COUNT (\d+)/);
  if (count) states = Number(count[1]);
  for (const match of line.matchAll(/\bACTIONS\((\d+)\)/g)) {
    const id = Number(match[1]);
    maxActions = Math.max(maxActions, id);
    if (id > 65535) overflowOccurrences++;
  }
}
console.log(JSON.stringify({artifact: String(path), states, maxActions,
  overflowOccurrences, limit: 65535}, null, 2));
if (states === null || maxActions === 0 || states > 65536 || overflowOccurrences) {
  process.exitCode = 1;
}
