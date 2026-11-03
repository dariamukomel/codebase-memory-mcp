type BaseNode = {
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
   * The content of the `node-types.json` file for this grammar.
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
 * A dialect grammar, loaded lazily on first access to `language`. Pass the
 * object itself to `parser.setLanguage(postgres)`, like the default export.
 */
type Dialect = {
  /** The grammar name, e.g. `"postgres_sql"`. */
  name: string;

  /**
   * The inner language object.
   * @private
   */
  language: unknown;

  /** The content of this dialect's `node-types.json` file. */
  nodeTypeInfo: NodeInfo[];

  /**
   * The syntax highlighting query for this dialect: the base highlights plus
   * the dialect's own, minus any pattern this dialect's grammar can't compile.
   * The base `HIGHLIGHTS_QUERY` does not compile against a dialect.
   */
  HIGHLIGHTS_QUERY?: string;
};

/** The tree-sitter language object for the spark_sql dialect. */
export declare const spark: Dialect;

/** The tree-sitter language object for the postgres_sql dialect. */
export declare const postgres: Dialect;

/** The tree-sitter language object for the mysql_sql dialect. */
export declare const mysql: Dialect;

/** The tree-sitter language object for the databricks_sql dialect. */
export declare const databricks: Dialect;

/** The tree-sitter language object for the snowflake_sql dialect. */
export declare const snowflake: Dialect;

/** The tree-sitter language object for the bigquery_sql dialect. */
export declare const bigquery: Dialect;

/** The tree-sitter language object for the mariadb_sql dialect. */
export declare const mariadb: Dialect;

/** The tree-sitter language object for the sqlite_sql dialect. */
export declare const sqlite: Dialect;

/** The tree-sitter language object for the hive_sql dialect. */
export declare const hive: Dialect;

/** The tree-sitter language object for the oracle_sql dialect. */
export declare const oracle: Dialect;

/** The tree-sitter language object for the db2_sql dialect. */
export declare const db2: Dialect;

/** The tree-sitter language object for the tsql dialect. */
export declare const tsql: Dialect;

/** The tree-sitter language object for the duckdb_sql dialect. */
export declare const duckdb: Dialect;

/** The tree-sitter language object for the trino_sql dialect. */
export declare const trino: Dialect;

/** The tree-sitter language object for the athena_sql dialect. */
export declare const athena: Dialect;

/** The tree-sitter language object for the redshift_sql dialect. */
export declare const redshift: Dialect;

/** The tree-sitter language object for the clickhouse_sql dialect. */
export declare const clickhouse: Dialect;

/** The tree-sitter language object for the flink_sql dialect. */
export declare const flink: Dialect;

/** The tree-sitter language object for the cockroachdb_sql dialect. */
export declare const cockroachdb: Dialect;

/** The tree-sitter language object for the spanner_sql dialect. */
export declare const spanner: Dialect;

/** The tree-sitter language object for the teradata_sql dialect. */
export declare const teradata: Dialect;

/** The tree-sitter language object for the hana_sql dialect. */
export declare const hana: Dialect;
