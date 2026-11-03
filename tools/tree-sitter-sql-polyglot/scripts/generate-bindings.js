#!/usr/bin/env node
/**
 * Regenerates the Rust/Node/Python native binding source files so that they
 * expose the base grammar plus every dialect extension as a named export,
 * following the same "one compiled unit, multiple named languages" pattern
 * tree-sitter-typescript uses for {typescript, tsx}.
 *
 * Run after scripts/generate-all.js (each dialect's own src/parser.c must
 * already exist) and whenever a dialect is added or removed.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const GO_MODULE = readFileSync(`${ROOT}/go.mod`, 'utf8').match(/^module\s+(\S+)/m)[1];

// CMakeLists.txt is itself one of this script's outputs (see the C/CMake
// section below), so its version/URL are read from package.json - the same
// manifest bump-version.sh updates first - rather than from the file this
// script is about to overwrite.
const PKG = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8'));
const CMAKE_VERSION = PKG.version;
const CMAKE_HOMEPAGE_URL = PKG.repository.url;

const DIALECT_DIRS = [
  'spark', 'postgres', 'mysql', 'databricks', 'snowflake', 'bigquery',
  'mariadb', 'sqlite', 'hive', 'oracle', 'db2', 'tsql', 'duckdb', 'trino',
  'athena', 'redshift', 'clickhouse', 'flink', 'cockroachdb', 'spanner',
  'teradata', 'hana',
];

const DIALECTS = DIALECT_DIRS.map((dir) => {
  const grammarSrc = readFileSync(`${ROOT}/${dir}/grammar.js`, 'utf8');
  const grammarName = grammarSrc.match(/name:\s*'([^']+)'/)[1];
  return {
    dir,
    grammarName,
    // e.g. "databricks_sql" -> "tree_sitter_databricks_sql"
    cSymbol: `tree_sitter_${grammarName}`,
    // Rust/JS/Python identifier suffix, e.g. "databricks"
    ident: dir,
    upper: dir.toUpperCase(),
    // PascalCase for Swift target/product names, e.g. "cockroachdb" -> "Cockroachdb"
    pascal: dir[0].toUpperCase() + dir.slice(1),
  };
});

// ── Rust: bindings/rust/lib.rs ──────────────────────────────────────────────
// One Cargo feature per dialect (see Cargo.toml [features]); "full" enables all.
{
  const externs = DIALECTS.map((d) => `    #[cfg(feature = "${d.dir}")]\n    fn ${d.cSymbol}() -> *const ();`).join('\n');
  const consts = DIALECTS.map((d) => `
#[cfg(feature = "${d.dir}")]
/// The tree-sitter [\`LanguageFn\`][LanguageFn] for the ${d.grammarName} dialect.
pub const LANGUAGE_${d.upper}: LanguageFn = unsafe { LanguageFn::from_raw(${d.cSymbol}) };

#[cfg(feature = "${d.dir}")]
/// The content of the \`node-types.json\` file for the ${d.grammarName} dialect.
pub const NODE_TYPES_${d.upper}: &str = include_str!(concat!(env!("OUT_DIR"), "/${d.dir}_node-types.json"));

#[cfg(feature = "${d.dir}")]
/// The syntax highlighting query for the ${d.grammarName} dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [\`HIGHLIGHTS_QUERY\`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_${d.upper}: &str = include_str!("../../${d.dir}/queries/highlights.bundled.scm");`).join('\n');

  const tests = DIALECTS.map((d) => `
    #[cfg(feature = "${d.dir}")]
    #[test]
    fn test_can_load_${d.ident}_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_${d.upper}.into())
            .expect("Error loading ${d.grammarName} parser");
    }

    #[cfg(feature = "${d.dir}")]
    #[test]
    fn test_${d.ident}_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_${d.upper}.into(), super::HIGHLIGHTS_QUERY_${d.upper})
            .expect("${d.grammarName} highlights query does not compile");
    }`).join('\n');

  const content = `//! This crate provides Sql language support for the [tree-sitter][] parsing library,
//! plus every independently compiled dialect extension (see the \`LANGUAGE_*\` constants).
//!
//! Typically, you will use the [LANGUAGE][] constant to add this language to a
//! tree-sitter [Parser][], and then use the parser to parse some code:
//!
//! \`\`\`
//! let code = r#"
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_sql_polyglot::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Sql parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! \`\`\`
//!
//! [Parser]: https://docs.rs/tree-sitter/*/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_sql() -> *const ();
${externs}
}

/// The tree-sitter [\`LanguageFn\`][LanguageFn] for this grammar.
///
/// [LanguageFn]: https://docs.rs/tree-sitter-language/*/tree_sitter_language/struct.LanguageFn.html
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sql) };

/// The content of the [\`node-types.json\`][] file for this grammar.
///
/// [\`node-types.json\`]: https://tree-sitter.github.io/tree-sitter/using-parsers#static-node-types
pub const NODE_TYPES: &str = include_str!(concat!(env!("OUT_DIR"), "/base_node-types.json"));

pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");
${consts}

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Sql parser");
    }

    #[test]
    fn test_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE.into(), super::HIGHLIGHTS_QUERY)
            .expect("Sql highlights query does not compile");
    }
${tests}
}
`;
  writeFileSync(`${ROOT}/bindings/rust/lib.rs`, content);
}

// ── Rust: bindings/rust/build.rs ────────────────────────────────────────────
// compile() only runs per-dialect when Cargo's CARGO_FEATURE_<NAME> is set.
{
  const compileCalls = [`    compile("tree-sitter-sql", "base", "src".as_ref());`]
    .concat(DIALECTS.map((d) => `    if env::var("CARGO_FEATURE_${d.upper}").is_ok() {
        compile("tree-sitter-sql-${d.ident}", "${d.dir}", "${d.dir}/src".as_ref());
        bundle_highlights("${d.dir}");
    }`))
    .join('\n');

  const content = `use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn out_dir() -> PathBuf {
    PathBuf::from(env::var("OUT_DIR").unwrap())
}

/// Decompresses the committed \`.br\` blob into OUT_DIR (\`cargo publish\`
/// forbids build scripts from writing back into the source tree).
fn inflate(src_dir: &Path, ident: &str, file: &str) -> PathBuf {
    let blob_path = src_dir.join(format!("{file}.br"));
    println!("cargo:rerun-if-changed={}", blob_path.display());

    let compressed = fs::read(&blob_path).unwrap_or_else(|e| {
        panic!("missing {}: {e} (run \`node scripts/compress-parsers.js\`)", blob_path.display())
    });

    let mut out = Vec::new();
    brotli::BrotliDecompress(&mut compressed.as_slice(), &mut out)
        .unwrap_or_else(|e| panic!("failed to inflate {}: {e}", blob_path.display()));

    let out_path = out_dir().join(format!("{ident}_{file}"));
    fs::write(&out_path, out).unwrap_or_else(|e| panic!("failed to write {}: {e}", out_path.display()));
    out_path
}

/// lib.rs \`include_str!\`s each enabled dialect's highlights.bundled.scm. A
/// published crate ships them; a git checkout has to build them, which takes
/// Node (scripts/bundle-highlights.js, the same step inflate-parsers.js runs).
fn bundle_highlights(dir: &str) {
    let bundle = Path::new(dir).join("queries").join("highlights.bundled.scm");
    println!("cargo:rerun-if-changed={}", bundle.display());
    if bundle.exists() {
        return;
    }
    let status = std::process::Command::new("node")
        .args(["scripts/bundle-highlights.js", dir])
        .status();
    if !matches!(status, Ok(s) if s.success()) || !bundle.exists() {
        panic!(
            "missing {} and could not build it: run \`node scripts/inflate-parsers.js\` (needs Node)",
            bundle.display()
        );
    }
}

fn compile(name: &str, ident: &str, src_dir: &Path) {
    let mut c_config = cc::Build::new();
    c_config.std("c11").include(src_dir);

    #[cfg(target_env = "msvc")]
    c_config.flag("-utf-8");

    if std::env::var("TARGET").unwrap() == "wasm32-unknown-unknown" {
        let Ok(wasm_headers) = std::env::var("DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS") else {
            panic!("Environment variable DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS must be set by the language crate");
        };
        let Ok(wasm_src) =
            std::env::var("DEP_TREE_SITTER_LANGUAGE_WASM_SRC").map(std::path::PathBuf::from)
        else {
            panic!("Environment variable DEP_TREE_SITTER_LANGUAGE_WASM_SRC must be set by the language crate");
        };

        c_config.include(&wasm_headers);
        c_config.files([
            wasm_src.join("stdio.c"),
            wasm_src.join("stdlib.c"),
            wasm_src.join("string.c"),
        ]);
    }

    let parser_path = inflate(src_dir, ident, "parser.c");
    c_config.file(&parser_path);

    inflate(src_dir, ident, "node-types.json");

    let scanner_path = src_dir.join("scanner.c");
    if scanner_path.exists() {
        c_config.file(&scanner_path);
        println!("cargo:rerun-if-changed={}", scanner_path.to_str().unwrap());
    }

    c_config.compile(name);
}

fn main() {
${compileCalls}

    println!("cargo:rustc-check-cfg=cfg(with_highlights_query)");
    if !"queries/highlights.scm".is_empty() && std::path::Path::new("queries/highlights.scm").exists() {
        println!("cargo:rustc-cfg=with_highlights_query");
    }
    println!("cargo:rustc-check-cfg=cfg(with_injections_query)");
    if !"queries/injections.scm".is_empty() && std::path::Path::new("queries/injections.scm").exists() {
        println!("cargo:rustc-cfg=with_injections_query");
    }
    println!("cargo:rustc-check-cfg=cfg(with_locals_query)");
    if !"queries/locals.scm".is_empty() && std::path::Path::new("queries/locals.scm").exists() {
        println!("cargo:rustc-cfg=with_locals_query");
    }
    println!("cargo:rustc-check-cfg=cfg(with_tags_query)");
    if !"queries/tags.scm".is_empty() && std::path::Path::new("queries/tags.scm").exists() {
        println!("cargo:rustc-cfg=with_tags_query");
    }
}
`;
  writeFileSync(`${ROOT}/bindings/rust/build.rs`, content);
}

// ── Node: bindings/node/binding.cc + binding_<dialect>.cc ───────────────────
// One native addon per dialect (own NODE_API_MODULE), so index.js can load
// just one instead of all 22.
const LANGUAGE_TYPE_TAG_DECL = `// "tree-sitter", "language" hashed with BLAKE2
const napi_type_tag LANGUAGE_TYPE_TAG = {
    0x8AF2E5212AD58ABF, 0xD5006CAD83ABBA16
};`;

{
  const content = `#include <napi.h>

typedef struct TSLanguage TSLanguage;

extern "C" TSLanguage *tree_sitter_sql();

${LANGUAGE_TYPE_TAG_DECL}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports["name"] = Napi::String::New(env, "sql");
    auto language = Napi::External<TSLanguage>::New(env, tree_sitter_sql());
    language.TypeTag(&LANGUAGE_TYPE_TAG);
    exports["language"] = language;
    return exports;
}

NODE_API_MODULE(tree_sitter_sql_binding, Init)
`;
  writeFileSync(`${ROOT}/bindings/node/binding.cc`, content);
}

for (const d of DIALECTS) {
  const content = `#include <napi.h>

typedef struct TSLanguage TSLanguage;

extern "C" TSLanguage *${d.cSymbol}();

${LANGUAGE_TYPE_TAG_DECL}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports["name"] = Napi::String::New(env, "${d.grammarName}");
    auto language = Napi::External<TSLanguage>::New(env, ${d.cSymbol}());
    language.TypeTag(&LANGUAGE_TYPE_TAG);
    exports["language"] = language;
    return exports;
}

NODE_API_MODULE(tree_sitter_sql_${d.ident}_binding, Init)
`;
  writeFileSync(`${ROOT}/bindings/node/binding_${d.ident}.cc`, content);
}

// ── Node: binding.gyp ────────────────────────────────────────────────────────
// One node-gyp target per dialect (+ base); see index.js for why.
{
  const cflagsConditions = `            "conditions": [
                ["OS!='win'", {
                    "cflags_c": [
                        "-std=c11",
                    ],
                }, {  # OS == "win"
                    "cflags_c": [
                      "/std:c11",
                      "/utf-8",
                    ],
                }],
            ],`;

  const baseTarget = `        {
            "target_name": "tree_sitter_sql_binding",
            "dependencies": [
                "<!(node -p \\"require('node-addon-api').targets\\"):node_addon_api_except",
            ],
            "include_dirs": ["src"],
            "sources": [
                "bindings/node/binding.cc",
                "src/parser.c",
                "src/scanner.c",
            ],
${cflagsConditions}
        }`;

  const dialectTargets = DIALECTS.map((d) => `        {
            "target_name": "tree_sitter_sql_${d.ident}_binding",
            "dependencies": [
                "<!(node -p \\"require('node-addon-api').targets\\"):node_addon_api_except",
            ],
            "include_dirs": ["${d.dir}/src"],
            "sources": [
                "bindings/node/binding_${d.ident}.cc",
                "${d.dir}/src/parser.c",
                "${d.dir}/src/scanner.c",
            ],
${cflagsConditions}
        }`).join(',\n');

  const content = `{
    "targets": [
${[baseTarget, dialectTargets].join(',\n')}
    ]
}
`;
  writeFileSync(`${ROOT}/binding.gyp`, content);
}

// ── Node: bindings/node/index.js ────────────────────────────────────────────
// Each dialect's `language` is a lazy, self-caching getter: the addon loads
// only when `.language` is first read.
{
  const isBunImports = DIALECTS.map((d) => `const ${d.ident}Bun = isBun ? await import(\`\${root}/prebuilds/\${process.platform}-\${process.arch}/tree_sitter_sql_${d.ident}_binding.node\`) : null;`).join('\n');

  const dialectExports = DIALECTS.map((d) => `export const ${d.ident} = lazyDialect("${d.grammarName}", "tree_sitter_sql_${d.ident}_binding", () => ${d.ident}Bun, "${d.dir}");`).join('\n');

  const content = `import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const isBun = typeof process.versions.bun === "string";
const require = isBun ? null : createRequire(import.meta.url);

// node-gyp-build always resolves to the alphabetically first .node file,
// which breaks with 23 targets. Mirror its search order for one exact name.
function loadTarget(targetName) {
  const candidates = [
    join(root, "build", "Release", \`\${targetName}.node\`),
    join(root, "build", "Debug", \`\${targetName}.node\`),
    join(root, "prebuilds", \`\${process.platform}-\${process.arch}\`, \`\${targetName}.node\`),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return require(file);
  }
  throw new Error(\`No native build found for "\${targetName}". Looked in:\\n  \${candidates.join("\\n  ")}\`);
}

// Reads a query file on first access and caches it; undefined if it's absent.
function lazyQuery(object, prop, path) {
  Object.defineProperty(object, prop, {
    configurable: true,
    enumerable: true,
    get() {
      delete object[prop];
      try {
        object[prop] = readFileSync(path, "utf8");
      } catch { }
      return object[prop];
    }
  });
}

function lazyDialect(grammarName, targetName, getBunBinding, dir) {
  const dialect = { name: grammarName };
  // The bundled query is the base + parent-chain + dialect highlights with
  // whatever this dialect's grammar lacks removed (scripts/bundle-highlights.js),
  // so it compiles against \`dialect.language\` on its own.
  lazyQuery(dialect, "HIGHLIGHTS_QUERY", \`\${root}/\${dir}/queries/highlights.bundled.scm\`);
  // Pass the dialect object itself to parser.setLanguage(), like the default
  // export: node-tree-sitter caches per-language node classes on that object
  // (built from nodeTypeInfo), which it can't do on the bare \`language\` value.
  Object.defineProperty(dialect, "nodeTypeInfo", {
    configurable: true,
    enumerable: true,
    get() {
      let value;
      try {
        value = JSON.parse(readFileSync(\`\${root}/\${dir}/src/node-types.json\`, "utf8"));
      } catch { }
      Object.defineProperty(dialect, "nodeTypeInfo", { value, enumerable: true, configurable: true });
      return value;
    }
  });
  Object.defineProperty(dialect, "language", {
    configurable: true,
    enumerable: true,
    get() {
      // Bun needs statically analyzable import() calls to find .node files
      // at build time, so it can't use loadTarget()'s dynamic require().
      const value = (isBun ? getBunBinding() : loadTarget(targetName)).language;
      Object.defineProperty(dialect, "language", { value, enumerable: true, configurable: true });
      return value;
    }
  });
  return dialect;
}

${isBunImports}

const binding = isBun
  // Support \`bun build --compile\` by being statically analyzable enough to find the .node file at build-time
  ? await import(\`\${root}/prebuilds/\${process.platform}-\${process.arch}/tree_sitter_sql_binding.node\`)
  : loadTarget("tree_sitter_sql_binding");

try {
  const nodeTypes = await import(\`\${root}/src/node-types.json\`, { with: { type: "json" } });
  binding.nodeTypeInfo = nodeTypes.default;
} catch { }

const queries = [
  ["HIGHLIGHTS_QUERY", \`\${root}/queries/highlights.scm\`],
  ["INJECTIONS_QUERY", \`\${root}/queries/injections.scm\`],
  ["LOCALS_QUERY", \`\${root}/queries/locals.scm\`],
  ["TAGS_QUERY", \`\${root}/queries/tags.scm\`],
];

for (const [prop, path] of queries) {
  lazyQuery(binding, prop, path);
}

${dialectExports}

export default binding;
`;
  writeFileSync(`${ROOT}/bindings/node/index.js`, content);
}

// ── Node: bindings/node/index.d.ts ──────────────────────────────────────────
{
  const dialectDecls = DIALECTS.map((d) => `
/** The tree-sitter language object for the ${d.grammarName} dialect. */
export declare const ${d.ident}: Dialect;`).join('\n');

  const content = `type BaseNode = {
  type: string;
  named: boolean;
};

type ChildNode = {
  multiple: boolean;
  required: boolean;
  types: BaseNode[];
};

type NodeInfo =
  | (BaseNode & {
      subtypes: BaseNode[];
    })
  | (BaseNode & {
      fields: { [name: string]: ChildNode };
      children: ChildNode[];
    });

/**
 * The tree-sitter language object for this grammar.
 *
 * @see {@linkcode https://tree-sitter.github.io/node-tree-sitter/interfaces/Parser.Language.html Parser.Language}
 *
 * @example
 * import Parser from "tree-sitter";
 * import SQL from "tree-sitter-sql";
 *
 * const parser = new Parser();
 * parser.setLanguage(SQL);
 */
declare const binding: {
  /**
   * The inner language object.
   * @private
   */
  language: unknown;

  /**
   * The content of the \`node-types.json\` file for this grammar.
   *
   * @see {@linkplain https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types Static Node Types}
   */
  nodeTypeInfo: NodeInfo[];

  /** The syntax highlighting query for this grammar. */
  HIGHLIGHTS_QUERY?: string;

  /** The language injection query for this grammar. */
  INJECTIONS_QUERY?: string;

  /** The local variable query for this grammar. */
  LOCALS_QUERY?: string;

  /** The symbol tagging query for this grammar. */
  TAGS_QUERY?: string;
};

export default binding;

/**
 * A dialect grammar, loaded lazily on first access to \`language\`. Pass the
 * object itself to \`parser.setLanguage(postgres)\`, like the default export.
 */
type Dialect = {
  /** The grammar name, e.g. \`"postgres_sql"\`. */
  name: string;

  /**
   * The inner language object.
   * @private
   */
  language: unknown;

  /** The content of this dialect's \`node-types.json\` file. */
  nodeTypeInfo: NodeInfo[];

  /**
   * The syntax highlighting query for this dialect: the base highlights plus
   * the dialect's own, minus any pattern this dialect's grammar can't compile.
   * The base \`HIGHLIGHTS_QUERY\` does not compile against a dialect.
   */
  HIGHLIGHTS_QUERY?: string;
};
${dialectDecls}
`;
  writeFileSync(`${ROOT}/bindings/node/index.d.ts`, content);
}

// ── Python: binding.c + binding_<dialect>.c ─────────────────────────────────
// One extension module per dialect (own PyInit_), so __init__.py's
// __getattr__ can import just one on first access.
{
  const content = `#include <Python.h>

typedef struct TSLanguage TSLanguage;

TSLanguage *tree_sitter_sql(void);

static PyObject* _binding_language(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(tree_sitter_sql(), "tree_sitter.Language", NULL);
}

static struct PyModuleDef_Slot slots[] = {
#ifdef Py_GIL_DISABLED
    {Py_mod_gil, Py_MOD_GIL_NOT_USED},
#endif
    {0, NULL}
};

static PyMethodDef methods[] = {
    {"language", _binding_language, METH_NOARGS,
     "Get the tree-sitter language for this grammar."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef module = {
    .m_base = PyModuleDef_HEAD_INIT,
    .m_name = "_binding",
    .m_doc = NULL,
    .m_size = 0,
    .m_methods = methods,
    .m_slots = slots,
};

PyMODINIT_FUNC PyInit__binding(void) {
    return PyModuleDef_Init(&module);
}
`;
  writeFileSync(`${ROOT}/bindings/python/tree_sitter_sql/binding.c`, content);
}

for (const d of DIALECTS) {
  const content = `#include <Python.h>

typedef struct TSLanguage TSLanguage;

TSLanguage *${d.cSymbol}(void);

static PyObject* _binding_language_${d.ident}(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(${d.cSymbol}(), "tree_sitter.Language", NULL);
}

static struct PyModuleDef_Slot slots[] = {
#ifdef Py_GIL_DISABLED
    {Py_mod_gil, Py_MOD_GIL_NOT_USED},
#endif
    {0, NULL}
};

static PyMethodDef methods[] = {
    {"language_${d.ident}", _binding_language_${d.ident}, METH_NOARGS,
     "Get the tree-sitter language for the ${d.grammarName} dialect."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef module = {
    .m_base = PyModuleDef_HEAD_INIT,
    .m_name = "_binding_${d.ident}",
    .m_doc = NULL,
    .m_size = 0,
    .m_methods = methods,
    .m_slots = slots,
};

PyMODINIT_FUNC PyInit__binding_${d.ident}(void) {
    return PyModuleDef_Init(&module);
}
`;
  writeFileSync(`${ROOT}/bindings/python/tree_sitter_sql/binding_${d.ident}.c`, content);
}

// ── Python: bindings/python/tree_sitter_sql/__init__.py ─────────────────────
// PEP 562 module-level __getattr__ imports each dialect's extension module
// only on first access, instead of eagerly re-exporting all 22.
{
  const reexports = DIALECTS.map((d) => `"language_${d.ident}": "_binding_${d.ident}",`).join('\n    ');
  const allNames = DIALECTS.map((d) => `"language_${d.ident}"`).join(',\n    ');
  const queryNames = DIALECTS.map((d) => `"HIGHLIGHTS_QUERY_${d.upper}"`).join(',\n    ');

  const content = `"""Tree-sitter Grammar for SQL"""

import importlib
from importlib.resources import files as _files

from ._binding import language

# name -> extension module holding it, for the lazy __getattr__ below.
_DIALECT_MODULES = {
    ${reexports}
}


def _get_query(name, file):
    query = _files(f"{__package__}.queries") / file
    globals()[name] = query.read_text()
    return globals()[name]


def __getattr__(name):
    if name in _DIALECT_MODULES:
        module = importlib.import_module(f".{_DIALECT_MODULES[name]}", __package__)
        fn = getattr(module, name)
        globals()[name] = fn
        return fn

    # NOTE: uncomment these to include any queries that this grammar contains:

    if name == "HIGHLIGHTS_QUERY":
        return _get_query("HIGHLIGHTS_QUERY", "highlights.scm")
    # A dialect's standalone highlights (see scripts/bundle-highlights.js);
    # the base HIGHLIGHTS_QUERY does not compile against a dialect.
    if name.startswith("HIGHLIGHTS_QUERY_"):
        dialect = name[len("HIGHLIGHTS_QUERY_"):].lower()
        if f"language_{dialect}" in _DIALECT_MODULES:
            return _get_query(name, f"highlights_{dialect}.scm")
    # if name == "INJECTIONS_QUERY":
    #     return _get_query("INJECTIONS_QUERY", "injections.scm")
    # if name == "LOCALS_QUERY":
    #     return _get_query("LOCALS_QUERY", "locals.scm")
    # if name == "TAGS_QUERY":
    #     return _get_query("TAGS_QUERY", "tags.scm")

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "language",
    ${allNames},
    "HIGHLIGHTS_QUERY",
    ${queryNames},
    # "INJECTIONS_QUERY",
    # "LOCALS_QUERY",
    # "TAGS_QUERY",
]


def __dir__():
    return sorted(__all__ + [
        "__all__", "__builtins__", "__cached__", "__doc__", "__file__",
        "__loader__", "__name__", "__package__", "__path__", "__spec__",
    ])
`;
  writeFileSync(`${ROOT}/bindings/python/tree_sitter_sql/__init__.py`, content);
}

// ── Python: bindings/python/tree_sitter_sql/__init__.pyi ────────────────────
{
  const fnDecls = DIALECTS.map((d) => `
def language_${d.ident}() -> CapsuleType:
    """The tree-sitter language function for the ${d.grammarName} dialect."""`).join('\n');
  const queryDecls = DIALECTS.map((d) => `
HIGHLIGHTS_QUERY_${d.upper}: Final[str]
"""The syntax highlighting query for the ${d.grammarName} dialect."""`).join('\n');

  const content = `from typing import Final
from typing_extensions import CapsuleType

HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for this grammar."""

INJECTIONS_QUERY: Final[str] | None
"""The language injection query for this grammar."""

LOCALS_QUERY: Final[str] | None
"""The local variable query for this grammar."""

TAGS_QUERY: Final[str] | None
"""The symbol tagging query for this grammar."""
${queryDecls}

def language() -> CapsuleType:
    """The tree-sitter language function for this grammar."""
${fnDecls}
`;
  writeFileSync(`${ROOT}/bindings/python/tree_sitter_sql/__init__.pyi`, content);
}

// ── Go: bindings/go/<dialect>/binding.go + binding_test.go ──────────────────
// bindings/go/binding.go (base) is hand-maintained, not generated here. Each
// dialect is its own subpackage; cgo only compiles what's actually imported.
for (const d of DIALECTS) {
  const dir = `${ROOT}/bindings/go/${d.ident}`;
  mkdirSync(dir, { recursive: true });

  const binding = `package ${d.ident}

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../${d.dir}/src/parser.c"
// #include "../../../${d.dir}/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the ${d.grammarName} dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.${d.cSymbol}())
}
`;
  writeFileSync(`${dir}/binding.go`, binding);

  const test = `package ${d.ident}_test

import (
	"testing"

	${d.ident} "${GO_MODULE}/bindings/go/${d.ident}"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(${d.ident}.Language())
	if language == nil {
		t.Errorf("Error loading ${d.grammarName} grammar")
	}
}
`;
  writeFileSync(`${dir}/binding_test.go`, test);
}

// ── Swift: Package.swift + bindings/swift/TreeSitterSql<Dialect>/*.h ───────
// One SPM target + library product per dialect, alongside base.
{
  const headerGuard = (d) => `TREE_SITTER_${d.upper}_SQL_H_`;

  for (const d of DIALECTS) {
    const headerDir = `${ROOT}/bindings/swift/TreeSitterSql${d.pascal}`;
    mkdirSync(headerDir, { recursive: true });
    writeFileSync(`${headerDir}/${d.ident}.h`, `#ifndef ${headerGuard(d)}
#define ${headerGuard(d)}

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *${d.cSymbol}(void);

#ifdef __cplusplus
}
#endif

#endif // ${headerGuard(d)}
`);

    const testDir = `${ROOT}/bindings/swift/TreeSitterSql${d.pascal}Tests`;
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/TreeSitterSql${d.pascal}Tests.swift`, `import XCTest
import SwiftTreeSitter
import TreeSitterSql${d.pascal}

final class TreeSitterSql${d.pascal}Tests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: ${d.cSymbol}())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading ${d.grammarName} grammar")
    }
}
`);
  }

  const dialectProducts = DIALECTS.map((d) => `        .library(name: "TreeSitterSql${d.pascal}", targets: ["TreeSitterSql${d.pascal}"]),`).join('\n');

  const dialectTargets = DIALECTS.map((d) => `        .target(
            name: "TreeSitterSql${d.pascal}",
            dependencies: [],
            path: ".",
            sources: [
                "${d.dir}/src/parser.c",
                "${d.dir}/src/scanner.c"
            ],
            resources: [
                .copy("${d.dir}/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSql${d.pascal}",
            cSettings: [.headerSearchPath("${d.dir}/src")]
        ),`).join('\n');

  const dialectTestTargets = DIALECTS.map((d) => `        .testTarget(
            name: "TreeSitterSql${d.pascal}Tests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSql${d.pascal}",
            ],
            path: "bindings/swift/TreeSitterSql${d.pascal}Tests"
        ),`).join('\n');

  const content = `// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "TreeSitterSql",
    products: [
        .library(name: "TreeSitterSql", targets: ["TreeSitterSql"]),
${dialectProducts}
    ],
    dependencies: [
        .package(name: "SwiftTreeSitter", url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.8.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterSql",
            dependencies: [],
            path: ".",
            sources: [
                "src/parser.c",
                "src/scanner.c"
            ],
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSql",
            cSettings: [.headerSearchPath("src")]
        ),
${dialectTargets}
        .testTarget(
            name: "TreeSitterSqlTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSql",
            ],
            path: "bindings/swift/TreeSitterSqlTests"
        ),
${dialectTestTargets}
    ],
    cLanguageStandard: .c11
)
`;
  writeFileSync(`${ROOT}/Package.swift`, content);
}

// ── C/CMake: CMakeLists.txt + bindings/c/ ───────────────────────────────────
// One CMake project (not one per dialect), with a CMake option per dialect
// that's OFF by default - the same shape as Cargo.toml's [features]: a plain
// `cmake -B build` builds base only, `-DTREE_SITTER_SQL_POSTGRES=ON` adds
// postgres to that same configure/build, and `-DTREE_SITTER_SQL_FULL=ON`
// enables every dialect at once. Each enabled dialect still gets its own
// library target/artifact (`tree-sitter-sql-postgres`, ...), same as Cargo
// still produces one compiled object per feature under the hood - CMake has
// no equivalent of a single artifact exposing conditional symbols the way a
// Rust crate does with #[cfg(feature = ...)].
//
// Regenerates parser.c straight from each grammar.js via the tree-sitter
// CLI, same as before - it does not use the compressed .br blobs the other
// five bindings ship, since CMake consumers are expected to have the CLI.
{
  const headerGuard = (d) => `TREE_SITTER_SQL_${d.upper}_H_`;

  mkdirSync(`${ROOT}/bindings/c/tree_sitter`, { recursive: true });

  for (const d of DIALECTS) {
    writeFileSync(`${ROOT}/bindings/c/tree_sitter/tree-sitter-sql-${d.ident}.h`, `#ifndef ${headerGuard(d)}
#define ${headerGuard(d)}

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *${d.cSymbol}(void);

#ifdef __cplusplus
}
#endif

#endif // ${headerGuard(d)}
`);

    writeFileSync(`${ROOT}/bindings/c/tree-sitter-sql-${d.ident}.pc.in`, `prefix=@CMAKE_INSTALL_PREFIX@
libdir=\${prefix}/@CMAKE_INSTALL_LIBDIR@
includedir=\${prefix}/@CMAKE_INSTALL_INCLUDEDIR@

Name: tree-sitter-sql-${d.ident}
Description: Tree-sitter Grammar for SQL (${d.grammarName} dialect)
URL: @PROJECT_HOMEPAGE_URL@
Version: @PROJECT_VERSION@
Requires: @TS_REQUIRES@
Libs: -L\${libdir} -ltree-sitter-sql-${d.ident}
Cflags: -I\${includedir}
`);
  }

  const dialectBlocks = DIALECTS.map((d) => `
option(TREE_SITTER_SQL_${d.upper} "Enable the ${d.grammarName} dialect extension" OFF)
if(TREE_SITTER_SQL_${d.upper} OR TREE_SITTER_SQL_FULL)
  add_custom_command(OUTPUT "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/grammar.json"
                            "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/node-types.json"
                     DEPENDS "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/grammar.js"
                     COMMAND "\${TREE_SITTER_CLI}" generate grammar.js --no-parser
                     WORKING_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}"
                     COMMENT "Generating ${d.dir}/grammar.json")
  add_custom_command(OUTPUT "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/parser.c"
                     BYPRODUCTS "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/tree_sitter/parser.h"
                                "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/tree_sitter/alloc.h"
                                "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/tree_sitter/array.h"
                     DEPENDS "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}/src/grammar.json"
                     COMMAND "\${TREE_SITTER_CLI}" generate src/grammar.json
                              --abi=\${TREE_SITTER_ABI_VERSION}
                     WORKING_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}/${d.dir}"
                     COMMENT "Generating ${d.dir}/parser.c")

  add_library(tree-sitter-sql-${d.ident} ${d.dir}/src/parser.c)
  if(EXISTS ${d.dir}/src/scanner.c)
    target_sources(tree-sitter-sql-${d.ident} PRIVATE ${d.dir}/src/scanner.c)
  endif()
  target_include_directories(tree-sitter-sql-${d.ident}
                             PRIVATE ${d.dir}/src
                             INTERFACE $<BUILD_INTERFACE:\${CMAKE_CURRENT_SOURCE_DIR}/bindings/c>
                                       $<INSTALL_INTERFACE:\${CMAKE_INSTALL_INCLUDEDIR}>)
  target_compile_definitions(tree-sitter-sql-${d.ident} PRIVATE
                             $<$<BOOL:\${TREE_SITTER_REUSE_ALLOCATOR}>:TREE_SITTER_REUSE_ALLOCATOR>
                             $<$<CONFIG:Debug>:TREE_SITTER_DEBUG>)
  set_target_properties(tree-sitter-sql-${d.ident}
                        PROPERTIES
                        C_STANDARD 11
                        POSITION_INDEPENDENT_CODE ON
                        SOVERSION "\${TREE_SITTER_ABI_VERSION}.\${PROJECT_VERSION_MAJOR}"
                        DEFINE_SYMBOL "")
  configure_file(bindings/c/tree-sitter-sql-${d.ident}.pc.in
                 "\${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-sql-${d.ident}.pc" @ONLY)
  install(FILES "\${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-sql-${d.ident}.pc"
          DESTINATION "\${CMAKE_INSTALL_DATAROOTDIR}/pkgconfig")
  install(TARGETS tree-sitter-sql-${d.ident}
          LIBRARY DESTINATION "\${CMAKE_INSTALL_LIBDIR}")
endif()
`).join('');

  const cmakeContent = `cmake_minimum_required(VERSION 3.13)

project(tree-sitter-sql
        VERSION "${CMAKE_VERSION}"
        DESCRIPTION "Tree-sitter Grammar for SQL"
        HOMEPAGE_URL "${CMAKE_HOMEPAGE_URL}"
        LANGUAGES C)

option(BUILD_SHARED_LIBS "Build using shared libraries" ON)
option(TREE_SITTER_REUSE_ALLOCATOR "Reuse the library allocator" OFF)
option(TREE_SITTER_SQL_FULL "Enable every dialect extension" OFF)

set(TREE_SITTER_ABI_VERSION 14 CACHE STRING "Tree-sitter ABI version")
if(NOT \${TREE_SITTER_ABI_VERSION} MATCHES "^[0-9]+$")
    unset(TREE_SITTER_ABI_VERSION CACHE)
    message(FATAL_ERROR "TREE_SITTER_ABI_VERSION must be an integer")
endif()

find_program(TREE_SITTER_CLI tree-sitter DOC "Tree-sitter CLI")
include(GNUInstallDirs)

# ── base grammar (always built) ─────────────────────────────────────────────
add_custom_command(OUTPUT "\${CMAKE_CURRENT_SOURCE_DIR}/src/grammar.json"
                          "\${CMAKE_CURRENT_SOURCE_DIR}/src/node-types.json"
                   DEPENDS "\${CMAKE_CURRENT_SOURCE_DIR}/grammar.js"
                   COMMAND "\${TREE_SITTER_CLI}" generate grammar.js --no-parser
                   WORKING_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}"
                   COMMENT "Generating grammar.json")

add_custom_command(OUTPUT "\${CMAKE_CURRENT_SOURCE_DIR}/src/parser.c"
                   BYPRODUCTS "\${CMAKE_CURRENT_SOURCE_DIR}/src/tree_sitter/parser.h"
                              "\${CMAKE_CURRENT_SOURCE_DIR}/src/tree_sitter/alloc.h"
                              "\${CMAKE_CURRENT_SOURCE_DIR}/src/tree_sitter/array.h"
                   DEPENDS "\${CMAKE_CURRENT_SOURCE_DIR}/src/grammar.json"
                   COMMAND "\${TREE_SITTER_CLI}" generate src/grammar.json
                            --abi=\${TREE_SITTER_ABI_VERSION}
                   WORKING_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}"
                   COMMENT "Generating parser.c")

add_library(tree-sitter-sql src/parser.c)
if(EXISTS src/scanner.c)
  target_sources(tree-sitter-sql PRIVATE src/scanner.c)
endif()
target_include_directories(tree-sitter-sql
                           PRIVATE src
                           INTERFACE $<BUILD_INTERFACE:\${CMAKE_CURRENT_SOURCE_DIR}/bindings/c>
                                     $<INSTALL_INTERFACE:\${CMAKE_INSTALL_INCLUDEDIR}>)

target_compile_definitions(tree-sitter-sql PRIVATE
                           $<$<BOOL:\${TREE_SITTER_REUSE_ALLOCATOR}>:TREE_SITTER_REUSE_ALLOCATOR>
                           $<$<CONFIG:Debug>:TREE_SITTER_DEBUG>)

set_target_properties(tree-sitter-sql
                      PROPERTIES
                      C_STANDARD 11
                      POSITION_INDEPENDENT_CODE ON
                      SOVERSION "\${TREE_SITTER_ABI_VERSION}.\${PROJECT_VERSION_MAJOR}"
                      DEFINE_SYMBOL "")

configure_file(bindings/c/tree-sitter-sql.pc.in
               "\${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-sql.pc" @ONLY)

install(DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}/bindings/c/tree_sitter"
        DESTINATION "\${CMAKE_INSTALL_INCLUDEDIR}"
        FILES_MATCHING PATTERN "*.h")
install(FILES "\${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-sql.pc"
        DESTINATION "\${CMAKE_INSTALL_DATAROOTDIR}/pkgconfig")
install(TARGETS tree-sitter-sql
        LIBRARY DESTINATION "\${CMAKE_INSTALL_LIBDIR}")

# ── dialect extensions: one CMake option each, off by default ──────────────
# Mirrors Cargo.toml's [features]: no dialect is enabled by default (a plain
# \`cmake -B build\` builds base only); enable one or more with
# \`-DTREE_SITTER_SQL_<DIALECT>=ON\`, or every dialect at once with
# \`-DTREE_SITTER_SQL_FULL=ON\`. Generated by scripts/generate-bindings.js -
# do not hand-edit this section; it's rewritten whenever that script runs.
${dialectBlocks}
add_custom_target(ts-test "\${TREE_SITTER_CLI}" test
                  WORKING_DIRECTORY "\${CMAKE_CURRENT_SOURCE_DIR}"
                  COMMENT "tree-sitter test")

# vim:ft=cmake:
`;
  writeFileSync(`${ROOT}/CMakeLists.txt`, cmakeContent);
}

console.log(`generate-bindings: wrote Rust/Node/Python/Go/Swift/CMake bindings for base + ${DIALECTS.length} dialects.`);
