/*
 * Databricks SQL external scanner.
 * Delegates to the shared base scanner (src/scanner.c) via macro renaming.
 * The base scanner handles PostgreSQL-style dollar-quoted strings ($$...$$)
 * which Databricks SQL also uses for Python/Scala UDF bodies.
 */

#define tree_sitter_sql_external_scanner_create      tree_sitter_databricks_sql_external_scanner_create
#define tree_sitter_sql_external_scanner_destroy     tree_sitter_databricks_sql_external_scanner_destroy
#define tree_sitter_sql_external_scanner_scan        tree_sitter_databricks_sql_external_scanner_scan
#define tree_sitter_sql_external_scanner_serialize   tree_sitter_databricks_sql_external_scanner_serialize
#define tree_sitter_sql_external_scanner_deserialize tree_sitter_databricks_sql_external_scanner_deserialize

#include "../../src/scanner.c"
