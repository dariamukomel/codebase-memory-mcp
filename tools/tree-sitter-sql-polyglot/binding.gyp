{
    "targets": [
        {
            "target_name": "tree_sitter_sql_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["src"],
            "sources": [
                "bindings/node/binding.cc",
                "src/parser.c",
                "src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_spark_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["spark/src"],
            "sources": [
                "bindings/node/binding_spark.cc",
                "spark/src/parser.c",
                "spark/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_postgres_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["postgres/src"],
            "sources": [
                "bindings/node/binding_postgres.cc",
                "postgres/src/parser.c",
                "postgres/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_mysql_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["mysql/src"],
            "sources": [
                "bindings/node/binding_mysql.cc",
                "mysql/src/parser.c",
                "mysql/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_databricks_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["databricks/src"],
            "sources": [
                "bindings/node/binding_databricks.cc",
                "databricks/src/parser.c",
                "databricks/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_snowflake_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["snowflake/src"],
            "sources": [
                "bindings/node/binding_snowflake.cc",
                "snowflake/src/parser.c",
                "snowflake/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_bigquery_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["bigquery/src"],
            "sources": [
                "bindings/node/binding_bigquery.cc",
                "bigquery/src/parser.c",
                "bigquery/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_mariadb_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["mariadb/src"],
            "sources": [
                "bindings/node/binding_mariadb.cc",
                "mariadb/src/parser.c",
                "mariadb/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_sqlite_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["sqlite/src"],
            "sources": [
                "bindings/node/binding_sqlite.cc",
                "sqlite/src/parser.c",
                "sqlite/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_hive_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["hive/src"],
            "sources": [
                "bindings/node/binding_hive.cc",
                "hive/src/parser.c",
                "hive/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_oracle_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["oracle/src"],
            "sources": [
                "bindings/node/binding_oracle.cc",
                "oracle/src/parser.c",
                "oracle/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_db2_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["db2/src"],
            "sources": [
                "bindings/node/binding_db2.cc",
                "db2/src/parser.c",
                "db2/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_tsql_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["tsql/src"],
            "sources": [
                "bindings/node/binding_tsql.cc",
                "tsql/src/parser.c",
                "tsql/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_duckdb_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["duckdb/src"],
            "sources": [
                "bindings/node/binding_duckdb.cc",
                "duckdb/src/parser.c",
                "duckdb/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_trino_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["trino/src"],
            "sources": [
                "bindings/node/binding_trino.cc",
                "trino/src/parser.c",
                "trino/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_athena_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["athena/src"],
            "sources": [
                "bindings/node/binding_athena.cc",
                "athena/src/parser.c",
                "athena/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_redshift_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["redshift/src"],
            "sources": [
                "bindings/node/binding_redshift.cc",
                "redshift/src/parser.c",
                "redshift/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_clickhouse_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["clickhouse/src"],
            "sources": [
                "bindings/node/binding_clickhouse.cc",
                "clickhouse/src/parser.c",
                "clickhouse/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_flink_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["flink/src"],
            "sources": [
                "bindings/node/binding_flink.cc",
                "flink/src/parser.c",
                "flink/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_cockroachdb_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["cockroachdb/src"],
            "sources": [
                "bindings/node/binding_cockroachdb.cc",
                "cockroachdb/src/parser.c",
                "cockroachdb/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_spanner_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["spanner/src"],
            "sources": [
                "bindings/node/binding_spanner.cc",
                "spanner/src/parser.c",
                "spanner/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_teradata_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["teradata/src"],
            "sources": [
                "bindings/node/binding_teradata.cc",
                "teradata/src/parser.c",
                "teradata/src/scanner.c",
            ],
            "conditions": [
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
            ],
        },
        {
            "target_name": "tree_sitter_sql_hana_binding",
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
            ],
            "include_dirs": ["hana/src"],
            "sources": [
                "bindings/node/binding_hana.cc",
                "hana/src/parser.c",
                "hana/src/scanner.c",
            ],
            "conditions": [
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
            ],
        }
    ]
}
