//! This crate provides Sql language support for the [tree-sitter][] parsing library,
//! plus every independently compiled dialect extension (see the `LANGUAGE_*` constants).
//!
//! Typically, you will use the [LANGUAGE][] constant to add this language to a
//! tree-sitter [Parser][], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_sql_polyglot::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Sql parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [Parser]: https://docs.rs/tree-sitter/*/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_sql() -> *const ();
    #[cfg(feature = "spark")]
    fn tree_sitter_spark_sql() -> *const ();
    #[cfg(feature = "postgres")]
    fn tree_sitter_postgres_sql() -> *const ();
    #[cfg(feature = "mysql")]
    fn tree_sitter_mysql_sql() -> *const ();
    #[cfg(feature = "databricks")]
    fn tree_sitter_databricks_sql() -> *const ();
    #[cfg(feature = "snowflake")]
    fn tree_sitter_snowflake_sql() -> *const ();
    #[cfg(feature = "bigquery")]
    fn tree_sitter_bigquery_sql() -> *const ();
    #[cfg(feature = "mariadb")]
    fn tree_sitter_mariadb_sql() -> *const ();
    #[cfg(feature = "sqlite")]
    fn tree_sitter_sqlite_sql() -> *const ();
    #[cfg(feature = "hive")]
    fn tree_sitter_hive_sql() -> *const ();
    #[cfg(feature = "oracle")]
    fn tree_sitter_oracle_sql() -> *const ();
    #[cfg(feature = "db2")]
    fn tree_sitter_db2_sql() -> *const ();
    #[cfg(feature = "tsql")]
    fn tree_sitter_tsql() -> *const ();
    #[cfg(feature = "duckdb")]
    fn tree_sitter_duckdb_sql() -> *const ();
    #[cfg(feature = "trino")]
    fn tree_sitter_trino_sql() -> *const ();
    #[cfg(feature = "athena")]
    fn tree_sitter_athena_sql() -> *const ();
    #[cfg(feature = "redshift")]
    fn tree_sitter_redshift_sql() -> *const ();
    #[cfg(feature = "clickhouse")]
    fn tree_sitter_clickhouse_sql() -> *const ();
    #[cfg(feature = "flink")]
    fn tree_sitter_flink_sql() -> *const ();
    #[cfg(feature = "cockroachdb")]
    fn tree_sitter_cockroachdb_sql() -> *const ();
    #[cfg(feature = "spanner")]
    fn tree_sitter_spanner_sql() -> *const ();
    #[cfg(feature = "teradata")]
    fn tree_sitter_teradata_sql() -> *const ();
    #[cfg(feature = "hana")]
    fn tree_sitter_hana_sql() -> *const ();
}

/// The tree-sitter [`LanguageFn`][LanguageFn] for this grammar.
///
/// [LanguageFn]: https://docs.rs/tree-sitter-language/*/tree_sitter_language/struct.LanguageFn.html
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sql) };

/// The content of the [`node-types.json`][] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers#static-node-types
pub const NODE_TYPES: &str = include_str!(concat!(env!("OUT_DIR"), "/base_node-types.json"));

pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

#[cfg(feature = "spark")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the spark_sql dialect.
pub const LANGUAGE_SPARK: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_spark_sql) };

#[cfg(feature = "spark")]
/// The content of the `node-types.json` file for the spark_sql dialect.
pub const NODE_TYPES_SPARK: &str = include_str!(concat!(env!("OUT_DIR"), "/spark_node-types.json"));

#[cfg(feature = "spark")]
/// The syntax highlighting query for the spark_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_SPARK: &str = include_str!("../../spark/queries/highlights.bundled.scm");

#[cfg(feature = "postgres")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the postgres_sql dialect.
pub const LANGUAGE_POSTGRES: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_postgres_sql) };

#[cfg(feature = "postgres")]
/// The content of the `node-types.json` file for the postgres_sql dialect.
pub const NODE_TYPES_POSTGRES: &str = include_str!(concat!(env!("OUT_DIR"), "/postgres_node-types.json"));

#[cfg(feature = "postgres")]
/// The syntax highlighting query for the postgres_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_POSTGRES: &str = include_str!("../../postgres/queries/highlights.bundled.scm");

#[cfg(feature = "mysql")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the mysql_sql dialect.
pub const LANGUAGE_MYSQL: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_mysql_sql) };

#[cfg(feature = "mysql")]
/// The content of the `node-types.json` file for the mysql_sql dialect.
pub const NODE_TYPES_MYSQL: &str = include_str!(concat!(env!("OUT_DIR"), "/mysql_node-types.json"));

#[cfg(feature = "mysql")]
/// The syntax highlighting query for the mysql_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_MYSQL: &str = include_str!("../../mysql/queries/highlights.bundled.scm");

#[cfg(feature = "databricks")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the databricks_sql dialect.
pub const LANGUAGE_DATABRICKS: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_databricks_sql) };

#[cfg(feature = "databricks")]
/// The content of the `node-types.json` file for the databricks_sql dialect.
pub const NODE_TYPES_DATABRICKS: &str = include_str!(concat!(env!("OUT_DIR"), "/databricks_node-types.json"));

#[cfg(feature = "databricks")]
/// The syntax highlighting query for the databricks_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_DATABRICKS: &str = include_str!("../../databricks/queries/highlights.bundled.scm");

#[cfg(feature = "snowflake")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the snowflake_sql dialect.
pub const LANGUAGE_SNOWFLAKE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_snowflake_sql) };

#[cfg(feature = "snowflake")]
/// The content of the `node-types.json` file for the snowflake_sql dialect.
pub const NODE_TYPES_SNOWFLAKE: &str = include_str!(concat!(env!("OUT_DIR"), "/snowflake_node-types.json"));

#[cfg(feature = "snowflake")]
/// The syntax highlighting query for the snowflake_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_SNOWFLAKE: &str = include_str!("../../snowflake/queries/highlights.bundled.scm");

#[cfg(feature = "bigquery")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the bigquery_sql dialect.
pub const LANGUAGE_BIGQUERY: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_bigquery_sql) };

#[cfg(feature = "bigquery")]
/// The content of the `node-types.json` file for the bigquery_sql dialect.
pub const NODE_TYPES_BIGQUERY: &str = include_str!(concat!(env!("OUT_DIR"), "/bigquery_node-types.json"));

#[cfg(feature = "bigquery")]
/// The syntax highlighting query for the bigquery_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_BIGQUERY: &str = include_str!("../../bigquery/queries/highlights.bundled.scm");

#[cfg(feature = "mariadb")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the mariadb_sql dialect.
pub const LANGUAGE_MARIADB: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_mariadb_sql) };

#[cfg(feature = "mariadb")]
/// The content of the `node-types.json` file for the mariadb_sql dialect.
pub const NODE_TYPES_MARIADB: &str = include_str!(concat!(env!("OUT_DIR"), "/mariadb_node-types.json"));

#[cfg(feature = "mariadb")]
/// The syntax highlighting query for the mariadb_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_MARIADB: &str = include_str!("../../mariadb/queries/highlights.bundled.scm");

#[cfg(feature = "sqlite")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the sqlite_sql dialect.
pub const LANGUAGE_SQLITE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sqlite_sql) };

#[cfg(feature = "sqlite")]
/// The content of the `node-types.json` file for the sqlite_sql dialect.
pub const NODE_TYPES_SQLITE: &str = include_str!(concat!(env!("OUT_DIR"), "/sqlite_node-types.json"));

#[cfg(feature = "sqlite")]
/// The syntax highlighting query for the sqlite_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_SQLITE: &str = include_str!("../../sqlite/queries/highlights.bundled.scm");

#[cfg(feature = "hive")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the hive_sql dialect.
pub const LANGUAGE_HIVE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_hive_sql) };

#[cfg(feature = "hive")]
/// The content of the `node-types.json` file for the hive_sql dialect.
pub const NODE_TYPES_HIVE: &str = include_str!(concat!(env!("OUT_DIR"), "/hive_node-types.json"));

#[cfg(feature = "hive")]
/// The syntax highlighting query for the hive_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_HIVE: &str = include_str!("../../hive/queries/highlights.bundled.scm");

#[cfg(feature = "oracle")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the oracle_sql dialect.
pub const LANGUAGE_ORACLE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_oracle_sql) };

#[cfg(feature = "oracle")]
/// The content of the `node-types.json` file for the oracle_sql dialect.
pub const NODE_TYPES_ORACLE: &str = include_str!(concat!(env!("OUT_DIR"), "/oracle_node-types.json"));

#[cfg(feature = "oracle")]
/// The syntax highlighting query for the oracle_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_ORACLE: &str = include_str!("../../oracle/queries/highlights.bundled.scm");

#[cfg(feature = "db2")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the db2_sql dialect.
pub const LANGUAGE_DB2: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_db2_sql) };

#[cfg(feature = "db2")]
/// The content of the `node-types.json` file for the db2_sql dialect.
pub const NODE_TYPES_DB2: &str = include_str!(concat!(env!("OUT_DIR"), "/db2_node-types.json"));

#[cfg(feature = "db2")]
/// The syntax highlighting query for the db2_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_DB2: &str = include_str!("../../db2/queries/highlights.bundled.scm");

#[cfg(feature = "tsql")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the tsql dialect.
pub const LANGUAGE_TSQL: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_tsql) };

#[cfg(feature = "tsql")]
/// The content of the `node-types.json` file for the tsql dialect.
pub const NODE_TYPES_TSQL: &str = include_str!(concat!(env!("OUT_DIR"), "/tsql_node-types.json"));

#[cfg(feature = "tsql")]
/// The syntax highlighting query for the tsql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_TSQL: &str = include_str!("../../tsql/queries/highlights.bundled.scm");

#[cfg(feature = "duckdb")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the duckdb_sql dialect.
pub const LANGUAGE_DUCKDB: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_duckdb_sql) };

#[cfg(feature = "duckdb")]
/// The content of the `node-types.json` file for the duckdb_sql dialect.
pub const NODE_TYPES_DUCKDB: &str = include_str!(concat!(env!("OUT_DIR"), "/duckdb_node-types.json"));

#[cfg(feature = "duckdb")]
/// The syntax highlighting query for the duckdb_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_DUCKDB: &str = include_str!("../../duckdb/queries/highlights.bundled.scm");

#[cfg(feature = "trino")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the trino_sql dialect.
pub const LANGUAGE_TRINO: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_trino_sql) };

#[cfg(feature = "trino")]
/// The content of the `node-types.json` file for the trino_sql dialect.
pub const NODE_TYPES_TRINO: &str = include_str!(concat!(env!("OUT_DIR"), "/trino_node-types.json"));

#[cfg(feature = "trino")]
/// The syntax highlighting query for the trino_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_TRINO: &str = include_str!("../../trino/queries/highlights.bundled.scm");

#[cfg(feature = "athena")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the athena_sql dialect.
pub const LANGUAGE_ATHENA: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_athena_sql) };

#[cfg(feature = "athena")]
/// The content of the `node-types.json` file for the athena_sql dialect.
pub const NODE_TYPES_ATHENA: &str = include_str!(concat!(env!("OUT_DIR"), "/athena_node-types.json"));

#[cfg(feature = "athena")]
/// The syntax highlighting query for the athena_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_ATHENA: &str = include_str!("../../athena/queries/highlights.bundled.scm");

#[cfg(feature = "redshift")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the redshift_sql dialect.
pub const LANGUAGE_REDSHIFT: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_redshift_sql) };

#[cfg(feature = "redshift")]
/// The content of the `node-types.json` file for the redshift_sql dialect.
pub const NODE_TYPES_REDSHIFT: &str = include_str!(concat!(env!("OUT_DIR"), "/redshift_node-types.json"));

#[cfg(feature = "redshift")]
/// The syntax highlighting query for the redshift_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_REDSHIFT: &str = include_str!("../../redshift/queries/highlights.bundled.scm");

#[cfg(feature = "clickhouse")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the clickhouse_sql dialect.
pub const LANGUAGE_CLICKHOUSE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_clickhouse_sql) };

#[cfg(feature = "clickhouse")]
/// The content of the `node-types.json` file for the clickhouse_sql dialect.
pub const NODE_TYPES_CLICKHOUSE: &str = include_str!(concat!(env!("OUT_DIR"), "/clickhouse_node-types.json"));

#[cfg(feature = "clickhouse")]
/// The syntax highlighting query for the clickhouse_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_CLICKHOUSE: &str = include_str!("../../clickhouse/queries/highlights.bundled.scm");

#[cfg(feature = "flink")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the flink_sql dialect.
pub const LANGUAGE_FLINK: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_flink_sql) };

#[cfg(feature = "flink")]
/// The content of the `node-types.json` file for the flink_sql dialect.
pub const NODE_TYPES_FLINK: &str = include_str!(concat!(env!("OUT_DIR"), "/flink_node-types.json"));

#[cfg(feature = "flink")]
/// The syntax highlighting query for the flink_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_FLINK: &str = include_str!("../../flink/queries/highlights.bundled.scm");

#[cfg(feature = "cockroachdb")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the cockroachdb_sql dialect.
pub const LANGUAGE_COCKROACHDB: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_cockroachdb_sql) };

#[cfg(feature = "cockroachdb")]
/// The content of the `node-types.json` file for the cockroachdb_sql dialect.
pub const NODE_TYPES_COCKROACHDB: &str = include_str!(concat!(env!("OUT_DIR"), "/cockroachdb_node-types.json"));

#[cfg(feature = "cockroachdb")]
/// The syntax highlighting query for the cockroachdb_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_COCKROACHDB: &str = include_str!("../../cockroachdb/queries/highlights.bundled.scm");

#[cfg(feature = "spanner")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the spanner_sql dialect.
pub const LANGUAGE_SPANNER: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_spanner_sql) };

#[cfg(feature = "spanner")]
/// The content of the `node-types.json` file for the spanner_sql dialect.
pub const NODE_TYPES_SPANNER: &str = include_str!(concat!(env!("OUT_DIR"), "/spanner_node-types.json"));

#[cfg(feature = "spanner")]
/// The syntax highlighting query for the spanner_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_SPANNER: &str = include_str!("../../spanner/queries/highlights.bundled.scm");

#[cfg(feature = "teradata")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the teradata_sql dialect.
pub const LANGUAGE_TERADATA: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_teradata_sql) };

#[cfg(feature = "teradata")]
/// The content of the `node-types.json` file for the teradata_sql dialect.
pub const NODE_TYPES_TERADATA: &str = include_str!(concat!(env!("OUT_DIR"), "/teradata_node-types.json"));

#[cfg(feature = "teradata")]
/// The syntax highlighting query for the teradata_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_TERADATA: &str = include_str!("../../teradata/queries/highlights.bundled.scm");

#[cfg(feature = "hana")]
/// The tree-sitter [`LanguageFn`][LanguageFn] for the hana_sql dialect.
pub const LANGUAGE_HANA: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_hana_sql) };

#[cfg(feature = "hana")]
/// The content of the `node-types.json` file for the hana_sql dialect.
pub const NODE_TYPES_HANA: &str = include_str!(concat!(env!("OUT_DIR"), "/hana_node-types.json"));

#[cfg(feature = "hana")]
/// The syntax highlighting query for the hana_sql dialect: the base
/// highlights plus the dialect's own, minus any pattern this dialect's grammar
/// can't compile. [`HIGHLIGHTS_QUERY`] does not compile against a dialect.
pub const HIGHLIGHTS_QUERY_HANA: &str = include_str!("../../hana/queries/highlights.bundled.scm");

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

    #[cfg(feature = "spark")]
    #[test]
    fn test_can_load_spark_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_SPARK.into())
            .expect("Error loading spark_sql parser");
    }

    #[cfg(feature = "spark")]
    #[test]
    fn test_spark_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_SPARK.into(), super::HIGHLIGHTS_QUERY_SPARK)
            .expect("spark_sql highlights query does not compile");
    }

    #[cfg(feature = "postgres")]
    #[test]
    fn test_can_load_postgres_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_POSTGRES.into())
            .expect("Error loading postgres_sql parser");
    }

    #[cfg(feature = "postgres")]
    #[test]
    fn test_postgres_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_POSTGRES.into(), super::HIGHLIGHTS_QUERY_POSTGRES)
            .expect("postgres_sql highlights query does not compile");
    }

    #[cfg(feature = "mysql")]
    #[test]
    fn test_can_load_mysql_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_MYSQL.into())
            .expect("Error loading mysql_sql parser");
    }

    #[cfg(feature = "mysql")]
    #[test]
    fn test_mysql_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_MYSQL.into(), super::HIGHLIGHTS_QUERY_MYSQL)
            .expect("mysql_sql highlights query does not compile");
    }

    #[cfg(feature = "databricks")]
    #[test]
    fn test_can_load_databricks_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_DATABRICKS.into())
            .expect("Error loading databricks_sql parser");
    }

    #[cfg(feature = "databricks")]
    #[test]
    fn test_databricks_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_DATABRICKS.into(), super::HIGHLIGHTS_QUERY_DATABRICKS)
            .expect("databricks_sql highlights query does not compile");
    }

    #[cfg(feature = "snowflake")]
    #[test]
    fn test_can_load_snowflake_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_SNOWFLAKE.into())
            .expect("Error loading snowflake_sql parser");
    }

    #[cfg(feature = "snowflake")]
    #[test]
    fn test_snowflake_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_SNOWFLAKE.into(), super::HIGHLIGHTS_QUERY_SNOWFLAKE)
            .expect("snowflake_sql highlights query does not compile");
    }

    #[cfg(feature = "bigquery")]
    #[test]
    fn test_can_load_bigquery_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_BIGQUERY.into())
            .expect("Error loading bigquery_sql parser");
    }

    #[cfg(feature = "bigquery")]
    #[test]
    fn test_bigquery_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_BIGQUERY.into(), super::HIGHLIGHTS_QUERY_BIGQUERY)
            .expect("bigquery_sql highlights query does not compile");
    }

    #[cfg(feature = "mariadb")]
    #[test]
    fn test_can_load_mariadb_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_MARIADB.into())
            .expect("Error loading mariadb_sql parser");
    }

    #[cfg(feature = "mariadb")]
    #[test]
    fn test_mariadb_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_MARIADB.into(), super::HIGHLIGHTS_QUERY_MARIADB)
            .expect("mariadb_sql highlights query does not compile");
    }

    #[cfg(feature = "sqlite")]
    #[test]
    fn test_can_load_sqlite_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_SQLITE.into())
            .expect("Error loading sqlite_sql parser");
    }

    #[cfg(feature = "sqlite")]
    #[test]
    fn test_sqlite_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_SQLITE.into(), super::HIGHLIGHTS_QUERY_SQLITE)
            .expect("sqlite_sql highlights query does not compile");
    }

    #[cfg(feature = "hive")]
    #[test]
    fn test_can_load_hive_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_HIVE.into())
            .expect("Error loading hive_sql parser");
    }

    #[cfg(feature = "hive")]
    #[test]
    fn test_hive_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_HIVE.into(), super::HIGHLIGHTS_QUERY_HIVE)
            .expect("hive_sql highlights query does not compile");
    }

    #[cfg(feature = "oracle")]
    #[test]
    fn test_can_load_oracle_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_ORACLE.into())
            .expect("Error loading oracle_sql parser");
    }

    #[cfg(feature = "oracle")]
    #[test]
    fn test_oracle_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_ORACLE.into(), super::HIGHLIGHTS_QUERY_ORACLE)
            .expect("oracle_sql highlights query does not compile");
    }

    #[cfg(feature = "db2")]
    #[test]
    fn test_can_load_db2_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_DB2.into())
            .expect("Error loading db2_sql parser");
    }

    #[cfg(feature = "db2")]
    #[test]
    fn test_db2_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_DB2.into(), super::HIGHLIGHTS_QUERY_DB2)
            .expect("db2_sql highlights query does not compile");
    }

    #[cfg(feature = "tsql")]
    #[test]
    fn test_can_load_tsql_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_TSQL.into())
            .expect("Error loading tsql parser");
    }

    #[cfg(feature = "tsql")]
    #[test]
    fn test_tsql_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_TSQL.into(), super::HIGHLIGHTS_QUERY_TSQL)
            .expect("tsql highlights query does not compile");
    }

    #[cfg(feature = "duckdb")]
    #[test]
    fn test_can_load_duckdb_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_DUCKDB.into())
            .expect("Error loading duckdb_sql parser");
    }

    #[cfg(feature = "duckdb")]
    #[test]
    fn test_duckdb_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_DUCKDB.into(), super::HIGHLIGHTS_QUERY_DUCKDB)
            .expect("duckdb_sql highlights query does not compile");
    }

    #[cfg(feature = "trino")]
    #[test]
    fn test_can_load_trino_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_TRINO.into())
            .expect("Error loading trino_sql parser");
    }

    #[cfg(feature = "trino")]
    #[test]
    fn test_trino_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_TRINO.into(), super::HIGHLIGHTS_QUERY_TRINO)
            .expect("trino_sql highlights query does not compile");
    }

    #[cfg(feature = "athena")]
    #[test]
    fn test_can_load_athena_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_ATHENA.into())
            .expect("Error loading athena_sql parser");
    }

    #[cfg(feature = "athena")]
    #[test]
    fn test_athena_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_ATHENA.into(), super::HIGHLIGHTS_QUERY_ATHENA)
            .expect("athena_sql highlights query does not compile");
    }

    #[cfg(feature = "redshift")]
    #[test]
    fn test_can_load_redshift_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_REDSHIFT.into())
            .expect("Error loading redshift_sql parser");
    }

    #[cfg(feature = "redshift")]
    #[test]
    fn test_redshift_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_REDSHIFT.into(), super::HIGHLIGHTS_QUERY_REDSHIFT)
            .expect("redshift_sql highlights query does not compile");
    }

    #[cfg(feature = "clickhouse")]
    #[test]
    fn test_can_load_clickhouse_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_CLICKHOUSE.into())
            .expect("Error loading clickhouse_sql parser");
    }

    #[cfg(feature = "clickhouse")]
    #[test]
    fn test_clickhouse_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_CLICKHOUSE.into(), super::HIGHLIGHTS_QUERY_CLICKHOUSE)
            .expect("clickhouse_sql highlights query does not compile");
    }

    #[cfg(feature = "flink")]
    #[test]
    fn test_can_load_flink_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_FLINK.into())
            .expect("Error loading flink_sql parser");
    }

    #[cfg(feature = "flink")]
    #[test]
    fn test_flink_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_FLINK.into(), super::HIGHLIGHTS_QUERY_FLINK)
            .expect("flink_sql highlights query does not compile");
    }

    #[cfg(feature = "cockroachdb")]
    #[test]
    fn test_can_load_cockroachdb_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_COCKROACHDB.into())
            .expect("Error loading cockroachdb_sql parser");
    }

    #[cfg(feature = "cockroachdb")]
    #[test]
    fn test_cockroachdb_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_COCKROACHDB.into(), super::HIGHLIGHTS_QUERY_COCKROACHDB)
            .expect("cockroachdb_sql highlights query does not compile");
    }

    #[cfg(feature = "spanner")]
    #[test]
    fn test_can_load_spanner_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_SPANNER.into())
            .expect("Error loading spanner_sql parser");
    }

    #[cfg(feature = "spanner")]
    #[test]
    fn test_spanner_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_SPANNER.into(), super::HIGHLIGHTS_QUERY_SPANNER)
            .expect("spanner_sql highlights query does not compile");
    }

    #[cfg(feature = "teradata")]
    #[test]
    fn test_can_load_teradata_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_TERADATA.into())
            .expect("Error loading teradata_sql parser");
    }

    #[cfg(feature = "teradata")]
    #[test]
    fn test_teradata_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_TERADATA.into(), super::HIGHLIGHTS_QUERY_TERADATA)
            .expect("teradata_sql highlights query does not compile");
    }

    #[cfg(feature = "hana")]
    #[test]
    fn test_can_load_hana_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE_HANA.into())
            .expect("Error loading hana_sql parser");
    }

    #[cfg(feature = "hana")]
    #[test]
    fn test_hana_highlights_query_compiles() {
        tree_sitter::Query::new(&super::LANGUAGE_HANA.into(), super::HIGHLIGHTS_QUERY_HANA)
            .expect("hana_sql highlights query does not compile");
    }
}
