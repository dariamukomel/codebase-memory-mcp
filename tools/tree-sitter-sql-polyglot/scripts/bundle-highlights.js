#!/usr/bin/env node
/**
 * Writes <dialect>/queries/highlights.bundled.scm: a highlights query that
 * works on its own against that dialect's parser.
 *
 * A dialect's hand-written queries/highlights.scm only holds what the dialect
 * adds and starts with `; inherits: <parent>`. Editors that understand that
 * directive (nvim-treesitter, Helix) stitch the chain together themselves, but
 * the Rust/Node/Python packages hand out a plain query string, and tree-sitter
 * rejects a whole query if a single pattern names a node the language lacks.
 * The base query names keywords (keyword_leading, ...) that some dialects
 * dropped, so neither the base file nor the dialect file is usable alone.
 *
 * The bundle concatenates the query files along the dialect's real grammar
 * parent chain (read from the `import ... from '../<parent>/grammar.js'` line,
 * not from the `; inherits:` comment) and drops every pattern, or alternative
 * inside a top-level [...] list, that names a node type, field or anonymous
 * token missing from the dialect's node-types.json.
 *
 * The bundles are build outputs, gitignored like parser.c: inflate-parsers.js
 * (run by `npm install` and before every Rust/Python/Go/Swift build in CI and
 * publish.yml) calls writeBundles() after inflating the parsers. The Cargo
 * `include` list and npm `files` list ship them regardless of .gitignore.
 *
 * --check writes nothing and fails if a keyword the dialect's parser can
 * produce (one in its node-types.json) has no capture in its bundle: the
 * dialect counterpart of scripts/test-keywords.sh, which only covers base.
 *
 * Usage:
 *   node scripts/bundle-highlights.js            # write all bundles
 *   node scripts/bundle-highlights.js --check    # fail if a dialect keyword has no capture
 *   node scripts/bundle-highlights.js postgres   # write one dialect
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { brotliDecompressSync } from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DIALECT_DIRS = [
  'spark', 'postgres', 'mysql', 'databricks', 'snowflake', 'bigquery',
  'mariadb', 'sqlite', 'hive', 'oracle', 'db2', 'tsql', 'duckdb', 'trino',
  'athena', 'redshift', 'clickhouse', 'flink', 'cockroachdb', 'spanner',
  'teradata', 'hana',
];

// '' is the base grammar at the repo root.
function grammarParent(dir) {
  const src = readFileSync(`${ROOT}/${dir}/grammar.js`, 'utf8');
  const m = src.match(/from\s+['"]\.\.\/(?:([\w-]+)\/)?grammar\.js['"]/);
  if (!m) throw new Error(`${dir}/grammar.js: no parent grammar import found`);
  return m[1] ?? '';
}

function chain(dir) {
  const dirs = [dir];
  for (let d = grammarParent(dir); ; d = grammarParent(d)) {
    dirs.unshift(d);
    if (d === '') return dirs;
  }
}

// node-types.json is gitignored; the committed .br blob is the source of truth.
function nodeTypes(dir) {
  const plain = `${ROOT}/${dir}/src/node-types.json`;
  const blob = `${plain}.br`;
  const text = existsSync(blob)
    ? brotliDecompressSync(readFileSync(blob)).toString('utf8')
    : readFileSync(plain, 'utf8');
  const named = new Set(['ERROR', 'MISSING', '_']);
  const anonymous = new Set();
  const fields = new Set();
  const add = (t) => (t.named ? named : anonymous).add(t.type);
  for (const node of JSON.parse(text)) {
    add(node);
    for (const t of node.subtypes ?? []) add(t);
    for (const t of node.children?.types ?? []) add(t);
    for (const [name, child] of Object.entries(node.fields ?? {})) {
      fields.add(name);
      for (const t of child.types) add(t);
    }
  }
  return { named, anonymous, fields };
}

// ── A small tokenizer/parser for the query language ─────────────────────────

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const start = i;
    if (c === '"') {
      i++;
      while (src[i] !== '"') { if (src[i] === '\\') i++; i++; }
      i++;
      tokens.push({ kind: 'string', text: src.slice(start, i), start, end: i });
    } else if ('()[]'.includes(c)) {
      i++;
      tokens.push({ kind: c, text: c, start, end: i });
    } else {
      while (i < src.length && !/[\s()[\]";]/.test(src[i])) i++;
      tokens.push({ kind: 'atom', text: src.slice(start, i), start, end: i });
    }
  }
  return tokens;
}

// Items are a (...) node, a [...] alternation, a "string" or an atom, each
// with the @captures and quantifiers that trail it.
function parseItems(tokens, pos, closer) {
  const items = [];
  while (pos < tokens.length && tokens[pos].kind !== closer) {
    const tok = tokens[pos];
    let item;
    if (tok.kind === '(' || tok.kind === '[') {
      const [children, next] = parseItems(tokens, pos + 1, tok.kind === '(' ? ')' : ']');
      item = { kind: tok.kind, children, start: tok.start, end: tokens[next].end };
      pos = next + 1;
    } else {
      item = { kind: tok.kind, text: tok.text, start: tok.start, end: tok.end };
      pos++;
    }
    item.suffixEnd = item.end;
    while (pos < tokens.length && tokens[pos].kind === 'atom' && /^(@|[?*+]$)/.test(tokens[pos].text)) {
      item.suffixEnd = tokens[pos].end;
      pos++;
    }
    items.push(item);
  }
  return [items, pos];
}

// Every node type, field and anonymous token an item names must exist.
function missing(item, types, out = []) {
  if (item.kind === 'string') {
    if (!types.anonymous.has(JSON.parse(item.text))) out.push(item.text);
  } else if (item.kind === 'atom') {
    const t = item.text;
    if (t.endsWith(':') && !types.fields.has(t.slice(0, -1))) out.push(t);
    if (t.startsWith('!') && !types.fields.has(t.slice(1))) out.push(t);
  } else if (item.kind === '(') {
    const [head, ...rest] = item.children;
    if (head?.kind === 'atom' && head.text.startsWith('#')) return out; // predicate
    if (head?.kind === 'atom' && !head.text.startsWith('@') && !types.named.has(head.text)) {
      out.push(head.text);
    }
    for (const child of head?.kind === 'atom' ? rest : item.children) missing(child, types, out);
  } else {
    for (const child of item.children) missing(child, types, out);
  }
  return out;
}

function bundle(dir) {
  const types = nodeTypes(dir);
  const dirs = chain(dir);
  const sections = [];
  const dropped = [];
  for (const d of dirs) {
    const file = `${d ? `${d}/` : ''}queries/highlights.scm`;
    const src = readFileSync(`${ROOT}/${file}`, 'utf8');
    const [items] = parseItems(tokenize(src), 0, null);
    const kept = [];
    for (const item of items) {
      const text = src.slice(item.start, item.suffixEnd);
      if (item.kind !== '[') {
        const bad = missing(item, types);
        if (bad.length) dropped.push(...bad);
        else kept.push(text);
        continue;
      }
      // A top-level alternation: drop just the alternatives this dialect lacks.
      const alts = item.children.filter((alt) => {
        const bad = missing(alt, types);
        dropped.push(...bad);
        return bad.length === 0;
      });
      if (alts.length === 0) continue;
      const suffix = src.slice(item.end, item.suffixEnd);
      kept.push(`[\n${alts.map((a) => `  ${src.slice(a.start, a.suffixEnd)}`).join('\n')}\n]${suffix}`);
    }
    sections.push(`; ── ${file} ${'─'.repeat(Math.max(0, 72 - file.length))}\n\n${kept.join('\n\n')}`);
  }
  const header = `; GENERATED by scripts/bundle-highlights.js - do not edit.
;
; Standalone highlights query for ${dir}: ${dirs.map((d) => d || 'base').join(' -> ')},
; with every pattern the ${dir} grammar cannot compile removed. Edit the
; queries/highlights.scm files listed below instead.
`;
  const text = `${header}\n${sections.join('\n\n')}\n`;
  const captured = new Set([...text.matchAll(/\((keyword_\w+)\)/g)].map((m) => m[1]));
  const uncaptured = [...types.named].filter((t) => t.startsWith('keyword_') && !captured.has(t)).sort();
  return { text, dropped: [...new Set(dropped)], uncaptured };
}

// The hand-written sources only exist in a repo checkout. An installed npm
// package ships the bundles already built, so there is nothing to redo there.
export function hasSources(dirs = DIALECT_DIRS) {
  return dirs.every((d) => existsSync(`${ROOT}/${d}/queries/highlights.scm`) && existsSync(`${ROOT}/${d}/grammar.js`));
}

export function writeBundles(dirs = DIALECT_DIRS, { log = () => {} } = {}) {
  for (const dir of dirs) {
    const out = `${ROOT}/${dir}/queries/highlights.bundled.scm`;
    const { text, dropped } = bundle(dir);
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) writeFileSync(out, text);
    const note = dropped.length ? ` (dropped ${dropped.length}: ${dropped.slice(0, 6).join(', ')}${dropped.length > 6 ? ', ...' : ''})` : '';
    log(`${dir}: ${chain(dir).map((d) => d || 'base').join(' -> ')}${note}`);
  }
}

export function checkKeywords(dirs = DIALECT_DIRS) {
  let problems = 0;
  for (const dir of dirs) {
    const { uncaptured } = bundle(dir);
    if (uncaptured.length) {
      console.error(`${dir}: keywords with no highlight capture (add them to ${dir}/queries/highlights.scm): ${uncaptured.join(' ')}`);
      problems++;
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const only = args.filter((a) => !a.startsWith('--'));
  const targets = only.length ? only : DIALECT_DIRS;
  if (args.includes('--check')) {
    const problems = checkKeywords(targets);
    if (problems) {
      console.error(`\n${problems} dialect(s) with uncaptured keywords. Add them to the highest dialect in the grammar chain that produces them.`);
      process.exit(1);
    }
  } else {
    writeBundles(targets, { log: console.log });
  }
}
