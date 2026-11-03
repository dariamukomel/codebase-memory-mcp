"""Tree-sitter Grammar for SQL"""

import importlib
from importlib.resources import files as _files

from ._binding import language

# name -> extension module holding it, for the lazy __getattr__ below.
_DIALECT_MODULES = {
    "language_spark": "_binding_spark",
    "language_postgres": "_binding_postgres",
    "language_mysql": "_binding_mysql",
    "language_databricks": "_binding_databricks",
    "language_snowflake": "_binding_snowflake",
    "language_bigquery": "_binding_bigquery",
    "language_mariadb": "_binding_mariadb",
    "language_sqlite": "_binding_sqlite",
    "language_hive": "_binding_hive",
    "language_oracle": "_binding_oracle",
    "language_db2": "_binding_db2",
    "language_tsql": "_binding_tsql",
    "language_duckdb": "_binding_duckdb",
    "language_trino": "_binding_trino",
    "language_athena": "_binding_athena",
    "language_redshift": "_binding_redshift",
    "language_clickhouse": "_binding_clickhouse",
    "language_flink": "_binding_flink",
    "language_cockroachdb": "_binding_cockroachdb",
    "language_spanner": "_binding_spanner",
    "language_teradata": "_binding_teradata",
    "language_hana": "_binding_hana",
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
    "language_spark",
    "language_postgres",
    "language_mysql",
    "language_databricks",
    "language_snowflake",
    "language_bigquery",
    "language_mariadb",
    "language_sqlite",
    "language_hive",
    "language_oracle",
    "language_db2",
    "language_tsql",
    "language_duckdb",
    "language_trino",
    "language_athena",
    "language_redshift",
    "language_clickhouse",
    "language_flink",
    "language_cockroachdb",
    "language_spanner",
    "language_teradata",
    "language_hana",
    "HIGHLIGHTS_QUERY",
    "HIGHLIGHTS_QUERY_SPARK",
    "HIGHLIGHTS_QUERY_POSTGRES",
    "HIGHLIGHTS_QUERY_MYSQL",
    "HIGHLIGHTS_QUERY_DATABRICKS",
    "HIGHLIGHTS_QUERY_SNOWFLAKE",
    "HIGHLIGHTS_QUERY_BIGQUERY",
    "HIGHLIGHTS_QUERY_MARIADB",
    "HIGHLIGHTS_QUERY_SQLITE",
    "HIGHLIGHTS_QUERY_HIVE",
    "HIGHLIGHTS_QUERY_ORACLE",
    "HIGHLIGHTS_QUERY_DB2",
    "HIGHLIGHTS_QUERY_TSQL",
    "HIGHLIGHTS_QUERY_DUCKDB",
    "HIGHLIGHTS_QUERY_TRINO",
    "HIGHLIGHTS_QUERY_ATHENA",
    "HIGHLIGHTS_QUERY_REDSHIFT",
    "HIGHLIGHTS_QUERY_CLICKHOUSE",
    "HIGHLIGHTS_QUERY_FLINK",
    "HIGHLIGHTS_QUERY_COCKROACHDB",
    "HIGHLIGHTS_QUERY_SPANNER",
    "HIGHLIGHTS_QUERY_TERADATA",
    "HIGHLIGHTS_QUERY_HANA",
    # "INJECTIONS_QUERY",
    # "LOCALS_QUERY",
    # "TAGS_QUERY",
]


def __dir__():
    return sorted(__all__ + [
        "__all__", "__builtins__", "__cached__", "__doc__", "__file__",
        "__loader__", "__name__", "__package__", "__path__", "__spec__",
    ])
