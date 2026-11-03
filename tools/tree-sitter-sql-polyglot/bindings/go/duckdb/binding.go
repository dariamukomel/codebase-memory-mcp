package duckdb

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../../duckdb/src/parser.c"
// #include "../../../duckdb/src/scanner.c"
import "C"

import "unsafe"

// Language returns the tree-sitter Language for the duckdb_sql dialect.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_duckdb_sql())
}
