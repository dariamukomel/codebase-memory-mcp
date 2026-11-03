// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "TreeSitterSql",
    products: [
        .library(name: "TreeSitterSql", targets: ["TreeSitterSql"]),
        .library(name: "TreeSitterSqlSpark", targets: ["TreeSitterSqlSpark"]),
        .library(name: "TreeSitterSqlPostgres", targets: ["TreeSitterSqlPostgres"]),
        .library(name: "TreeSitterSqlMysql", targets: ["TreeSitterSqlMysql"]),
        .library(name: "TreeSitterSqlDatabricks", targets: ["TreeSitterSqlDatabricks"]),
        .library(name: "TreeSitterSqlSnowflake", targets: ["TreeSitterSqlSnowflake"]),
        .library(name: "TreeSitterSqlBigquery", targets: ["TreeSitterSqlBigquery"]),
        .library(name: "TreeSitterSqlMariadb", targets: ["TreeSitterSqlMariadb"]),
        .library(name: "TreeSitterSqlSqlite", targets: ["TreeSitterSqlSqlite"]),
        .library(name: "TreeSitterSqlHive", targets: ["TreeSitterSqlHive"]),
        .library(name: "TreeSitterSqlOracle", targets: ["TreeSitterSqlOracle"]),
        .library(name: "TreeSitterSqlDb2", targets: ["TreeSitterSqlDb2"]),
        .library(name: "TreeSitterSqlTsql", targets: ["TreeSitterSqlTsql"]),
        .library(name: "TreeSitterSqlDuckdb", targets: ["TreeSitterSqlDuckdb"]),
        .library(name: "TreeSitterSqlTrino", targets: ["TreeSitterSqlTrino"]),
        .library(name: "TreeSitterSqlAthena", targets: ["TreeSitterSqlAthena"]),
        .library(name: "TreeSitterSqlRedshift", targets: ["TreeSitterSqlRedshift"]),
        .library(name: "TreeSitterSqlClickhouse", targets: ["TreeSitterSqlClickhouse"]),
        .library(name: "TreeSitterSqlFlink", targets: ["TreeSitterSqlFlink"]),
        .library(name: "TreeSitterSqlCockroachdb", targets: ["TreeSitterSqlCockroachdb"]),
        .library(name: "TreeSitterSqlSpanner", targets: ["TreeSitterSqlSpanner"]),
        .library(name: "TreeSitterSqlTeradata", targets: ["TreeSitterSqlTeradata"]),
        .library(name: "TreeSitterSqlHana", targets: ["TreeSitterSqlHana"]),
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
        .target(
            name: "TreeSitterSqlSpark",
            dependencies: [],
            path: ".",
            sources: [
                "spark/src/parser.c",
                "spark/src/scanner.c"
            ],
            resources: [
                .copy("spark/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlSpark",
            cSettings: [.headerSearchPath("spark/src")]
        ),
        .target(
            name: "TreeSitterSqlPostgres",
            dependencies: [],
            path: ".",
            sources: [
                "postgres/src/parser.c",
                "postgres/src/scanner.c"
            ],
            resources: [
                .copy("postgres/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlPostgres",
            cSettings: [.headerSearchPath("postgres/src")]
        ),
        .target(
            name: "TreeSitterSqlMysql",
            dependencies: [],
            path: ".",
            sources: [
                "mysql/src/parser.c",
                "mysql/src/scanner.c"
            ],
            resources: [
                .copy("mysql/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlMysql",
            cSettings: [.headerSearchPath("mysql/src")]
        ),
        .target(
            name: "TreeSitterSqlDatabricks",
            dependencies: [],
            path: ".",
            sources: [
                "databricks/src/parser.c",
                "databricks/src/scanner.c"
            ],
            resources: [
                .copy("databricks/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlDatabricks",
            cSettings: [.headerSearchPath("databricks/src")]
        ),
        .target(
            name: "TreeSitterSqlSnowflake",
            dependencies: [],
            path: ".",
            sources: [
                "snowflake/src/parser.c",
                "snowflake/src/scanner.c"
            ],
            resources: [
                .copy("snowflake/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlSnowflake",
            cSettings: [.headerSearchPath("snowflake/src")]
        ),
        .target(
            name: "TreeSitterSqlBigquery",
            dependencies: [],
            path: ".",
            sources: [
                "bigquery/src/parser.c",
                "bigquery/src/scanner.c"
            ],
            resources: [
                .copy("bigquery/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlBigquery",
            cSettings: [.headerSearchPath("bigquery/src")]
        ),
        .target(
            name: "TreeSitterSqlMariadb",
            dependencies: [],
            path: ".",
            sources: [
                "mariadb/src/parser.c",
                "mariadb/src/scanner.c"
            ],
            resources: [
                .copy("mariadb/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlMariadb",
            cSettings: [.headerSearchPath("mariadb/src")]
        ),
        .target(
            name: "TreeSitterSqlSqlite",
            dependencies: [],
            path: ".",
            sources: [
                "sqlite/src/parser.c",
                "sqlite/src/scanner.c"
            ],
            resources: [
                .copy("sqlite/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlSqlite",
            cSettings: [.headerSearchPath("sqlite/src")]
        ),
        .target(
            name: "TreeSitterSqlHive",
            dependencies: [],
            path: ".",
            sources: [
                "hive/src/parser.c",
                "hive/src/scanner.c"
            ],
            resources: [
                .copy("hive/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlHive",
            cSettings: [.headerSearchPath("hive/src")]
        ),
        .target(
            name: "TreeSitterSqlOracle",
            dependencies: [],
            path: ".",
            sources: [
                "oracle/src/parser.c",
                "oracle/src/scanner.c"
            ],
            resources: [
                .copy("oracle/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlOracle",
            cSettings: [.headerSearchPath("oracle/src")]
        ),
        .target(
            name: "TreeSitterSqlDb2",
            dependencies: [],
            path: ".",
            sources: [
                "db2/src/parser.c",
                "db2/src/scanner.c"
            ],
            resources: [
                .copy("db2/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlDb2",
            cSettings: [.headerSearchPath("db2/src")]
        ),
        .target(
            name: "TreeSitterSqlTsql",
            dependencies: [],
            path: ".",
            sources: [
                "tsql/src/parser.c",
                "tsql/src/scanner.c"
            ],
            resources: [
                .copy("tsql/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlTsql",
            cSettings: [.headerSearchPath("tsql/src")]
        ),
        .target(
            name: "TreeSitterSqlDuckdb",
            dependencies: [],
            path: ".",
            sources: [
                "duckdb/src/parser.c",
                "duckdb/src/scanner.c"
            ],
            resources: [
                .copy("duckdb/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlDuckdb",
            cSettings: [.headerSearchPath("duckdb/src")]
        ),
        .target(
            name: "TreeSitterSqlTrino",
            dependencies: [],
            path: ".",
            sources: [
                "trino/src/parser.c",
                "trino/src/scanner.c"
            ],
            resources: [
                .copy("trino/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlTrino",
            cSettings: [.headerSearchPath("trino/src")]
        ),
        .target(
            name: "TreeSitterSqlAthena",
            dependencies: [],
            path: ".",
            sources: [
                "athena/src/parser.c",
                "athena/src/scanner.c"
            ],
            resources: [
                .copy("athena/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlAthena",
            cSettings: [.headerSearchPath("athena/src")]
        ),
        .target(
            name: "TreeSitterSqlRedshift",
            dependencies: [],
            path: ".",
            sources: [
                "redshift/src/parser.c",
                "redshift/src/scanner.c"
            ],
            resources: [
                .copy("redshift/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlRedshift",
            cSettings: [.headerSearchPath("redshift/src")]
        ),
        .target(
            name: "TreeSitterSqlClickhouse",
            dependencies: [],
            path: ".",
            sources: [
                "clickhouse/src/parser.c",
                "clickhouse/src/scanner.c"
            ],
            resources: [
                .copy("clickhouse/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlClickhouse",
            cSettings: [.headerSearchPath("clickhouse/src")]
        ),
        .target(
            name: "TreeSitterSqlFlink",
            dependencies: [],
            path: ".",
            sources: [
                "flink/src/parser.c",
                "flink/src/scanner.c"
            ],
            resources: [
                .copy("flink/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlFlink",
            cSettings: [.headerSearchPath("flink/src")]
        ),
        .target(
            name: "TreeSitterSqlCockroachdb",
            dependencies: [],
            path: ".",
            sources: [
                "cockroachdb/src/parser.c",
                "cockroachdb/src/scanner.c"
            ],
            resources: [
                .copy("cockroachdb/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlCockroachdb",
            cSettings: [.headerSearchPath("cockroachdb/src")]
        ),
        .target(
            name: "TreeSitterSqlSpanner",
            dependencies: [],
            path: ".",
            sources: [
                "spanner/src/parser.c",
                "spanner/src/scanner.c"
            ],
            resources: [
                .copy("spanner/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlSpanner",
            cSettings: [.headerSearchPath("spanner/src")]
        ),
        .target(
            name: "TreeSitterSqlTeradata",
            dependencies: [],
            path: ".",
            sources: [
                "teradata/src/parser.c",
                "teradata/src/scanner.c"
            ],
            resources: [
                .copy("teradata/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlTeradata",
            cSettings: [.headerSearchPath("teradata/src")]
        ),
        .target(
            name: "TreeSitterSqlHana",
            dependencies: [],
            path: ".",
            sources: [
                "hana/src/parser.c",
                "hana/src/scanner.c"
            ],
            resources: [
                .copy("hana/queries")
            ],
            publicHeadersPath: "bindings/swift/TreeSitterSqlHana",
            cSettings: [.headerSearchPath("hana/src")]
        ),
        .testTarget(
            name: "TreeSitterSqlTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSql",
            ],
            path: "bindings/swift/TreeSitterSqlTests"
        ),
        .testTarget(
            name: "TreeSitterSqlSparkTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlSpark",
            ],
            path: "bindings/swift/TreeSitterSqlSparkTests"
        ),
        .testTarget(
            name: "TreeSitterSqlPostgresTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlPostgres",
            ],
            path: "bindings/swift/TreeSitterSqlPostgresTests"
        ),
        .testTarget(
            name: "TreeSitterSqlMysqlTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlMysql",
            ],
            path: "bindings/swift/TreeSitterSqlMysqlTests"
        ),
        .testTarget(
            name: "TreeSitterSqlDatabricksTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlDatabricks",
            ],
            path: "bindings/swift/TreeSitterSqlDatabricksTests"
        ),
        .testTarget(
            name: "TreeSitterSqlSnowflakeTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlSnowflake",
            ],
            path: "bindings/swift/TreeSitterSqlSnowflakeTests"
        ),
        .testTarget(
            name: "TreeSitterSqlBigqueryTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlBigquery",
            ],
            path: "bindings/swift/TreeSitterSqlBigqueryTests"
        ),
        .testTarget(
            name: "TreeSitterSqlMariadbTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlMariadb",
            ],
            path: "bindings/swift/TreeSitterSqlMariadbTests"
        ),
        .testTarget(
            name: "TreeSitterSqlSqliteTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlSqlite",
            ],
            path: "bindings/swift/TreeSitterSqlSqliteTests"
        ),
        .testTarget(
            name: "TreeSitterSqlHiveTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlHive",
            ],
            path: "bindings/swift/TreeSitterSqlHiveTests"
        ),
        .testTarget(
            name: "TreeSitterSqlOracleTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlOracle",
            ],
            path: "bindings/swift/TreeSitterSqlOracleTests"
        ),
        .testTarget(
            name: "TreeSitterSqlDb2Tests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlDb2",
            ],
            path: "bindings/swift/TreeSitterSqlDb2Tests"
        ),
        .testTarget(
            name: "TreeSitterSqlTsqlTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlTsql",
            ],
            path: "bindings/swift/TreeSitterSqlTsqlTests"
        ),
        .testTarget(
            name: "TreeSitterSqlDuckdbTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlDuckdb",
            ],
            path: "bindings/swift/TreeSitterSqlDuckdbTests"
        ),
        .testTarget(
            name: "TreeSitterSqlTrinoTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlTrino",
            ],
            path: "bindings/swift/TreeSitterSqlTrinoTests"
        ),
        .testTarget(
            name: "TreeSitterSqlAthenaTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlAthena",
            ],
            path: "bindings/swift/TreeSitterSqlAthenaTests"
        ),
        .testTarget(
            name: "TreeSitterSqlRedshiftTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlRedshift",
            ],
            path: "bindings/swift/TreeSitterSqlRedshiftTests"
        ),
        .testTarget(
            name: "TreeSitterSqlClickhouseTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlClickhouse",
            ],
            path: "bindings/swift/TreeSitterSqlClickhouseTests"
        ),
        .testTarget(
            name: "TreeSitterSqlFlinkTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlFlink",
            ],
            path: "bindings/swift/TreeSitterSqlFlinkTests"
        ),
        .testTarget(
            name: "TreeSitterSqlCockroachdbTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlCockroachdb",
            ],
            path: "bindings/swift/TreeSitterSqlCockroachdbTests"
        ),
        .testTarget(
            name: "TreeSitterSqlSpannerTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlSpanner",
            ],
            path: "bindings/swift/TreeSitterSqlSpannerTests"
        ),
        .testTarget(
            name: "TreeSitterSqlTeradataTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlTeradata",
            ],
            path: "bindings/swift/TreeSitterSqlTeradataTests"
        ),
        .testTarget(
            name: "TreeSitterSqlHanaTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterSqlHana",
            ],
            path: "bindings/swift/TreeSitterSqlHanaTests"
        ),
    ],
    cLanguageStandard: .c11
)
