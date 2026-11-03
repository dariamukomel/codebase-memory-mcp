import { existsSync, readFileSync } from "node:fs";
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
    join(root, "build", "Release", `${targetName}.node`),
    join(root, "build", "Debug", `${targetName}.node`),
    join(root, "prebuilds", `${process.platform}-${process.arch}`, `${targetName}.node`),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return require(file);
  }
  throw new Error(`No native build found for "${targetName}". Looked in:\n  ${candidates.join("\n  ")}`);
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
  // so it compiles against `dialect.language` on its own.
  lazyQuery(dialect, "HIGHLIGHTS_QUERY", `${root}/${dir}/queries/highlights.bundled.scm`);
  // Pass the dialect object itself to parser.setLanguage(), like the default
  // export: node-tree-sitter caches per-language node classes on that object
  // (built from nodeTypeInfo), which it can't do on the bare `language` value.
  Object.defineProperty(dialect, "nodeTypeInfo", {
    configurable: true,
    enumerable: true,
    get() {
      let value;
      try {
        value = JSON.parse(readFileSync(`${root}/${dir}/src/node-types.json`, "utf8"));
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

const sparkBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_spark_binding.node`) : null;
const postgresBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_postgres_binding.node`) : null;
const mysqlBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_mysql_binding.node`) : null;
const databricksBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_databricks_binding.node`) : null;
const snowflakeBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_snowflake_binding.node`) : null;
const bigqueryBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_bigquery_binding.node`) : null;
const mariadbBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_mariadb_binding.node`) : null;
const sqliteBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_sqlite_binding.node`) : null;
const hiveBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_hive_binding.node`) : null;
const oracleBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_oracle_binding.node`) : null;
const db2Bun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_db2_binding.node`) : null;
const tsqlBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_tsql_binding.node`) : null;
const duckdbBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_duckdb_binding.node`) : null;
const trinoBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_trino_binding.node`) : null;
const athenaBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_athena_binding.node`) : null;
const redshiftBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_redshift_binding.node`) : null;
const clickhouseBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_clickhouse_binding.node`) : null;
const flinkBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_flink_binding.node`) : null;
const cockroachdbBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_cockroachdb_binding.node`) : null;
const spannerBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_spanner_binding.node`) : null;
const teradataBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_teradata_binding.node`) : null;
const hanaBun = isBun ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_hana_binding.node`) : null;

const binding = isBun
  // Support `bun build --compile` by being statically analyzable enough to find the .node file at build-time
  ? await import(`${root}/prebuilds/${process.platform}-${process.arch}/tree_sitter_sql_binding.node`)
  : loadTarget("tree_sitter_sql_binding");

try {
  const nodeTypes = await import(`${root}/src/node-types.json`, { with: { type: "json" } });
  binding.nodeTypeInfo = nodeTypes.default;
} catch { }

const queries = [
  ["HIGHLIGHTS_QUERY", `${root}/queries/highlights.scm`],
  ["INJECTIONS_QUERY", `${root}/queries/injections.scm`],
  ["LOCALS_QUERY", `${root}/queries/locals.scm`],
  ["TAGS_QUERY", `${root}/queries/tags.scm`],
];

for (const [prop, path] of queries) {
  lazyQuery(binding, prop, path);
}

export const spark = lazyDialect("spark_sql", "tree_sitter_sql_spark_binding", () => sparkBun, "spark");
export const postgres = lazyDialect("postgres_sql", "tree_sitter_sql_postgres_binding", () => postgresBun, "postgres");
export const mysql = lazyDialect("mysql_sql", "tree_sitter_sql_mysql_binding", () => mysqlBun, "mysql");
export const databricks = lazyDialect("databricks_sql", "tree_sitter_sql_databricks_binding", () => databricksBun, "databricks");
export const snowflake = lazyDialect("snowflake_sql", "tree_sitter_sql_snowflake_binding", () => snowflakeBun, "snowflake");
export const bigquery = lazyDialect("bigquery_sql", "tree_sitter_sql_bigquery_binding", () => bigqueryBun, "bigquery");
export const mariadb = lazyDialect("mariadb_sql", "tree_sitter_sql_mariadb_binding", () => mariadbBun, "mariadb");
export const sqlite = lazyDialect("sqlite_sql", "tree_sitter_sql_sqlite_binding", () => sqliteBun, "sqlite");
export const hive = lazyDialect("hive_sql", "tree_sitter_sql_hive_binding", () => hiveBun, "hive");
export const oracle = lazyDialect("oracle_sql", "tree_sitter_sql_oracle_binding", () => oracleBun, "oracle");
export const db2 = lazyDialect("db2_sql", "tree_sitter_sql_db2_binding", () => db2Bun, "db2");
export const tsql = lazyDialect("tsql", "tree_sitter_sql_tsql_binding", () => tsqlBun, "tsql");
export const duckdb = lazyDialect("duckdb_sql", "tree_sitter_sql_duckdb_binding", () => duckdbBun, "duckdb");
export const trino = lazyDialect("trino_sql", "tree_sitter_sql_trino_binding", () => trinoBun, "trino");
export const athena = lazyDialect("athena_sql", "tree_sitter_sql_athena_binding", () => athenaBun, "athena");
export const redshift = lazyDialect("redshift_sql", "tree_sitter_sql_redshift_binding", () => redshiftBun, "redshift");
export const clickhouse = lazyDialect("clickhouse_sql", "tree_sitter_sql_clickhouse_binding", () => clickhouseBun, "clickhouse");
export const flink = lazyDialect("flink_sql", "tree_sitter_sql_flink_binding", () => flinkBun, "flink");
export const cockroachdb = lazyDialect("cockroachdb_sql", "tree_sitter_sql_cockroachdb_binding", () => cockroachdbBun, "cockroachdb");
export const spanner = lazyDialect("spanner_sql", "tree_sitter_sql_spanner_binding", () => spannerBun, "spanner");
export const teradata = lazyDialect("teradata_sql", "tree_sitter_sql_teradata_binding", () => teradataBun, "teradata");
export const hana = lazyDialect("hana_sql", "tree_sitter_sql_hana_binding", () => hanaBun, "hana");

export default binding;
