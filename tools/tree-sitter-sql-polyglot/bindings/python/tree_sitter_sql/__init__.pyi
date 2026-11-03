from typing import Final
from typing_extensions import CapsuleType

HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for this grammar."""

INJECTIONS_QUERY: Final[str] | None
"""The language injection query for this grammar."""

LOCALS_QUERY: Final[str] | None
"""The local variable query for this grammar."""

TAGS_QUERY: Final[str] | None
"""The symbol tagging query for this grammar."""

HIGHLIGHTS_QUERY_SPARK: Final[str]
"""The syntax highlighting query for the spark_sql dialect."""

HIGHLIGHTS_QUERY_POSTGRES: Final[str]
"""The syntax highlighting query for the postgres_sql dialect."""

HIGHLIGHTS_QUERY_MYSQL: Final[str]
"""The syntax highlighting query for the mysql_sql dialect."""

HIGHLIGHTS_QUERY_DATABRICKS: Final[str]
"""The syntax highlighting query for the databricks_sql dialect."""

HIGHLIGHTS_QUERY_SNOWFLAKE: Final[str]
"""The syntax highlighting query for the snowflake_sql dialect."""

HIGHLIGHTS_QUERY_BIGQUERY: Final[str]
"""The syntax highlighting query for the bigquery_sql dialect."""

HIGHLIGHTS_QUERY_MARIADB: Final[str]
"""The syntax highlighting query for the mariadb_sql dialect."""

HIGHLIGHTS_QUERY_SQLITE: Final[str]
"""The syntax highlighting query for the sqlite_sql dialect."""

HIGHLIGHTS_QUERY_HIVE: Final[str]
"""The syntax highlighting query for the hive_sql dialect."""

HIGHLIGHTS_QUERY_ORACLE: Final[str]
"""The syntax highlighting query for the oracle_sql dialect."""

HIGHLIGHTS_QUERY_DB2: Final[str]
"""The syntax highlighting query for the db2_sql dialect."""

HIGHLIGHTS_QUERY_TSQL: Final[str]
"""The syntax highlighting query for the tsql dialect."""

HIGHLIGHTS_QUERY_DUCKDB: Final[str]
"""The syntax highlighting query for the duckdb_sql dialect."""

HIGHLIGHTS_QUERY_TRINO: Final[str]
"""The syntax highlighting query for the trino_sql dialect."""

HIGHLIGHTS_QUERY_ATHENA: Final[str]
"""The syntax highlighting query for the athena_sql dialect."""

HIGHLIGHTS_QUERY_REDSHIFT: Final[str]
"""The syntax highlighting query for the redshift_sql dialect."""

HIGHLIGHTS_QUERY_CLICKHOUSE: Final[str]
"""The syntax highlighting query for the clickhouse_sql dialect."""

HIGHLIGHTS_QUERY_FLINK: Final[str]
"""The syntax highlighting query for the flink_sql dialect."""

HIGHLIGHTS_QUERY_COCKROACHDB: Final[str]
"""The syntax highlighting query for the cockroachdb_sql dialect."""

HIGHLIGHTS_QUERY_SPANNER: Final[str]
"""The syntax highlighting query for the spanner_sql dialect."""

HIGHLIGHTS_QUERY_TERADATA: Final[str]
"""The syntax highlighting query for the teradata_sql dialect."""

HIGHLIGHTS_QUERY_HANA: Final[str]
"""The syntax highlighting query for the hana_sql dialect."""

def language() -> CapsuleType:
    """The tree-sitter language function for this grammar."""

def language_spark() -> CapsuleType:
    """The tree-sitter language function for the spark_sql dialect."""

def language_postgres() -> CapsuleType:
    """The tree-sitter language function for the postgres_sql dialect."""

def language_mysql() -> CapsuleType:
    """The tree-sitter language function for the mysql_sql dialect."""

def language_databricks() -> CapsuleType:
    """The tree-sitter language function for the databricks_sql dialect."""

def language_snowflake() -> CapsuleType:
    """The tree-sitter language function for the snowflake_sql dialect."""

def language_bigquery() -> CapsuleType:
    """The tree-sitter language function for the bigquery_sql dialect."""

def language_mariadb() -> CapsuleType:
    """The tree-sitter language function for the mariadb_sql dialect."""

def language_sqlite() -> CapsuleType:
    """The tree-sitter language function for the sqlite_sql dialect."""

def language_hive() -> CapsuleType:
    """The tree-sitter language function for the hive_sql dialect."""

def language_oracle() -> CapsuleType:
    """The tree-sitter language function for the oracle_sql dialect."""

def language_db2() -> CapsuleType:
    """The tree-sitter language function for the db2_sql dialect."""

def language_tsql() -> CapsuleType:
    """The tree-sitter language function for the tsql dialect."""

def language_duckdb() -> CapsuleType:
    """The tree-sitter language function for the duckdb_sql dialect."""

def language_trino() -> CapsuleType:
    """The tree-sitter language function for the trino_sql dialect."""

def language_athena() -> CapsuleType:
    """The tree-sitter language function for the athena_sql dialect."""

def language_redshift() -> CapsuleType:
    """The tree-sitter language function for the redshift_sql dialect."""

def language_clickhouse() -> CapsuleType:
    """The tree-sitter language function for the clickhouse_sql dialect."""

def language_flink() -> CapsuleType:
    """The tree-sitter language function for the flink_sql dialect."""

def language_cockroachdb() -> CapsuleType:
    """The tree-sitter language function for the cockroachdb_sql dialect."""

def language_spanner() -> CapsuleType:
    """The tree-sitter language function for the spanner_sql dialect."""

def language_teradata() -> CapsuleType:
    """The tree-sitter language function for the teradata_sql dialect."""

def language_hana() -> CapsuleType:
    """The tree-sitter language function for the hana_sql dialect."""
