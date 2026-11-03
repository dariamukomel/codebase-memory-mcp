use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn out_dir() -> PathBuf {
    PathBuf::from(env::var("OUT_DIR").unwrap())
}

/// Decompresses the committed `.br` blob into OUT_DIR (`cargo publish`
/// forbids build scripts from writing back into the source tree).
fn inflate(src_dir: &Path, ident: &str, file: &str) -> PathBuf {
    let blob_path = src_dir.join(format!("{file}.br"));
    println!("cargo:rerun-if-changed={}", blob_path.display());

    let compressed = fs::read(&blob_path).unwrap_or_else(|e| {
        panic!("missing {}: {e} (run `node scripts/compress-parsers.js`)", blob_path.display())
    });

    let mut out = Vec::new();
    brotli::BrotliDecompress(&mut compressed.as_slice(), &mut out)
        .unwrap_or_else(|e| panic!("failed to inflate {}: {e}", blob_path.display()));

    let out_path = out_dir().join(format!("{ident}_{file}"));
    fs::write(&out_path, out).unwrap_or_else(|e| panic!("failed to write {}: {e}", out_path.display()));
    out_path
}

/// lib.rs `include_str!`s each enabled dialect's highlights.bundled.scm. A
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
            "missing {} and could not build it: run `node scripts/inflate-parsers.js` (needs Node)",
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
    compile("tree-sitter-sql", "base", "src".as_ref());
    if env::var("CARGO_FEATURE_SPARK").is_ok() {
        compile("tree-sitter-sql-spark", "spark", "spark/src".as_ref());
        bundle_highlights("spark");
    }
    if env::var("CARGO_FEATURE_POSTGRES").is_ok() {
        compile("tree-sitter-sql-postgres", "postgres", "postgres/src".as_ref());
        bundle_highlights("postgres");
    }
    if env::var("CARGO_FEATURE_MYSQL").is_ok() {
        compile("tree-sitter-sql-mysql", "mysql", "mysql/src".as_ref());
        bundle_highlights("mysql");
    }
    if env::var("CARGO_FEATURE_DATABRICKS").is_ok() {
        compile("tree-sitter-sql-databricks", "databricks", "databricks/src".as_ref());
        bundle_highlights("databricks");
    }
    if env::var("CARGO_FEATURE_SNOWFLAKE").is_ok() {
        compile("tree-sitter-sql-snowflake", "snowflake", "snowflake/src".as_ref());
        bundle_highlights("snowflake");
    }
    if env::var("CARGO_FEATURE_BIGQUERY").is_ok() {
        compile("tree-sitter-sql-bigquery", "bigquery", "bigquery/src".as_ref());
        bundle_highlights("bigquery");
    }
    if env::var("CARGO_FEATURE_MARIADB").is_ok() {
        compile("tree-sitter-sql-mariadb", "mariadb", "mariadb/src".as_ref());
        bundle_highlights("mariadb");
    }
    if env::var("CARGO_FEATURE_SQLITE").is_ok() {
        compile("tree-sitter-sql-sqlite", "sqlite", "sqlite/src".as_ref());
        bundle_highlights("sqlite");
    }
    if env::var("CARGO_FEATURE_HIVE").is_ok() {
        compile("tree-sitter-sql-hive", "hive", "hive/src".as_ref());
        bundle_highlights("hive");
    }
    if env::var("CARGO_FEATURE_ORACLE").is_ok() {
        compile("tree-sitter-sql-oracle", "oracle", "oracle/src".as_ref());
        bundle_highlights("oracle");
    }
    if env::var("CARGO_FEATURE_DB2").is_ok() {
        compile("tree-sitter-sql-db2", "db2", "db2/src".as_ref());
        bundle_highlights("db2");
    }
    if env::var("CARGO_FEATURE_TSQL").is_ok() {
        compile("tree-sitter-sql-tsql", "tsql", "tsql/src".as_ref());
        bundle_highlights("tsql");
    }
    if env::var("CARGO_FEATURE_DUCKDB").is_ok() {
        compile("tree-sitter-sql-duckdb", "duckdb", "duckdb/src".as_ref());
        bundle_highlights("duckdb");
    }
    if env::var("CARGO_FEATURE_TRINO").is_ok() {
        compile("tree-sitter-sql-trino", "trino", "trino/src".as_ref());
        bundle_highlights("trino");
    }
    if env::var("CARGO_FEATURE_ATHENA").is_ok() {
        compile("tree-sitter-sql-athena", "athena", "athena/src".as_ref());
        bundle_highlights("athena");
    }
    if env::var("CARGO_FEATURE_REDSHIFT").is_ok() {
        compile("tree-sitter-sql-redshift", "redshift", "redshift/src".as_ref());
        bundle_highlights("redshift");
    }
    if env::var("CARGO_FEATURE_CLICKHOUSE").is_ok() {
        compile("tree-sitter-sql-clickhouse", "clickhouse", "clickhouse/src".as_ref());
        bundle_highlights("clickhouse");
    }
    if env::var("CARGO_FEATURE_FLINK").is_ok() {
        compile("tree-sitter-sql-flink", "flink", "flink/src".as_ref());
        bundle_highlights("flink");
    }
    if env::var("CARGO_FEATURE_COCKROACHDB").is_ok() {
        compile("tree-sitter-sql-cockroachdb", "cockroachdb", "cockroachdb/src".as_ref());
        bundle_highlights("cockroachdb");
    }
    if env::var("CARGO_FEATURE_SPANNER").is_ok() {
        compile("tree-sitter-sql-spanner", "spanner", "spanner/src".as_ref());
        bundle_highlights("spanner");
    }
    if env::var("CARGO_FEATURE_TERADATA").is_ok() {
        compile("tree-sitter-sql-teradata", "teradata", "teradata/src".as_ref());
        bundle_highlights("teradata");
    }
    if env::var("CARGO_FEATURE_HANA").is_ok() {
        compile("tree-sitter-sql-hana", "hana", "hana/src".as_ref());
        bundle_highlights("hana");
    }

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
